const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const keepAlive = require('../keep-alive.js');
const { addAccount, getAllAccounts, getAccountById, deleteAccountById, createOrder, findPendingOrderByUser, updateOrderStatus, updateAccountStatus, getSoldOrders, calculateTotalRevenue, getAccountsByCategory } = require('./utils/database');
const { encrypt, decrypt, toBuffer, fromBuffer } = require('./utils/encryption');
const { getRecentTransactions } = require('./utils/casso.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

const pendingPayments = new Map();
const PAYMENT_TIMEOUT_MS = 10 * 60 * 1000;

function hasAdminPermission(interaction) {
    const adminRoleIds = (process.env.ADMIN_ROLE_IDS || '').split(',').map(id => id.trim()).filter(id => id);
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (adminRoleIds.length > 0 && adminRoleIds.some(roleId => interaction.member.roles.cache.has(roleId))) return true;
    return false;
}

client.once(Events.ClientReady, c => console.log(`✅ Sẵn sàng! Đã đăng nhập với tên ${c.user.tag}`));

function createShopPage(account, pageIndex, totalPages, category) {
    const shopEmbed = new EmbedBuilder()
        .setTitle(account.name)
        .setDescription(account.description || 'Không có mô tả cho sản phẩm này.')
        .setColor(0x3498DB)
        .addFields({ name: 'Giá bán', value: `${account.price.toLocaleString('vi-VN')} VNĐ` })
        .setFooter({ text: `Sản phẩm ${pageIndex + 1} / ${totalPages} | ID: ${account.id}` });

    let images = [];
    if (account.image_urls) {
        try {
            images = JSON.parse(account.image_urls);
            if (images.length > 0) shopEmbed.setImage(images[0]);
        } catch (e) { console.error(`Lỗi JSON image_urls cho account ID ${account.id}:`, e); }
    }

    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shop_nav_${category}_prev_${pageIndex}`).setLabel('Trước').setStyle(ButtonStyle.Primary).setDisabled(pageIndex === 0),
        new ButtonBuilder().setCustomId(`shop_nav_${category}_next_${pageIndex}`).setLabel('Sau').setStyle(ButtonStyle.Primary).setDisabled(pageIndex >= totalPages - 1)
    );
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`buy_now_${account.id}`).setLabel('Mua Ngay').setStyle(ButtonStyle.Success).setEmoji('💳')
    );
    if (images.length > 1) {
        actionRow.addComponents(new ButtonBuilder().setCustomId(`view_images_${account.id}_0`).setLabel('Xem Ảnh').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'));
    }

    return { embeds: [shopEmbed], components: [navigationRow, actionRow] };
}

client.on(Events.InteractionCreate, async interaction => {
    // 1. Xử lý lệnh Slash
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        if (command.data.name === 'admin_panel' || command.data.name === 'setup_shop') {
            if (!hasAdminPermission(interaction)) {
                return interaction.reply({ content: 'Bạn không có quyền.', ephemeral: true });
            }
        }
        try { await command.execute(interaction); }
        catch (error) { console.error(error); await interaction.reply({ content: 'Có lỗi xảy ra!', ephemeral: true }); }
    }
    // 2. Xử lý Nút Bấm
    else if (interaction.isButton()) {
        const customId = interaction.customId;
        const isAdminInteraction = customId.startsWith('admin_') || customId.startsWith('confirm_delete_') || customId === 'cancel_delete';
        if (isAdminInteraction) {
            if (!hasAdminPermission(interaction)) return interaction.reply({ content: 'Bạn không có quyền.', ephemeral: true });
        }

        if (customId === 'admin_add_account') {
            const embed = new EmbedBuilder()
                .setTitle('Chọn Loại Tài Khoản')
                .setDescription('Vui lòng chọn loại tài khoản bạn muốn thêm vào cửa hàng.')
                .setColor(0x5865F2);

            const dropmailButton = new ButtonBuilder().setCustomId('admin_add_category_DROPMAIL').setLabel('ACC DROPMAIL').setStyle(ButtonStyle.Success);
            const deadmailButton = new ButtonBuilder().setCustomId('admin_add_category_DEADMAIL').setLabel('ACC DEADMAIL FULL BH').setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(dropmailButton, deadmailButton);

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
        else if (customId.startsWith('admin_add_category_')) {
            const category = customId.split('_')[3];
            const modal = new ModalBuilder().setCustomId(`add_account_modal_${category}`).setTitle(`Thêm: ${category}`);
            const nameInput = new TextInputBuilder().setCustomId('name').setLabel("Tên sản phẩm").setStyle(TextInputStyle.Short).setRequired(true);
            const priceInput = new TextInputBuilder().setCustomId('price').setLabel("Giá bán (chỉ nhập số)").setStyle(TextInputStyle.Short).setRequired(true);
            const descriptionInput = new TextInputBuilder().setCustomId('description').setLabel("Mô tả chi tiết").setStyle(TextInputStyle.Paragraph).setRequired(true);
            const imageUrlsInput = new TextInputBuilder().setCustomId('imageUrls').setLabel("Các link ảnh (mỗi link một dòng)").setStyle(TextInputStyle.Paragraph).setRequired(false);
            const credentialsInput = new TextInputBuilder().setCustomId('credentials').setLabel("Tài khoản & Mật khẩu (dòng 1: tk, dòng 2: mk)").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(priceInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(imageUrlsInput),
                new ActionRowBuilder().addComponents(credentialsInput)
            );
            await interaction.showModal(modal);
        }
        else if (customId === 'admin_manage_inventory') {
            await interaction.deferReply({ ephemeral: true });
            const accounts = getAllAccounts();
            if (accounts.length === 0) { await interaction.editReply('Kho của bạn hiện đang trống.'); return; }
            const options = accounts.map(acc => ({ label: acc.name, description: `Giá: ${acc.price.toLocaleString('vi-VN')} VNĐ - ID: ${acc.id}`, value: acc.id.toString(), }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId('select_account_to_manage').setPlaceholder('Chọn tài khoản...').addOptions(options);
            await interaction.editReply({ content: 'Vui lòng chọn tài khoản:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }
        else if (customId === 'admin_sales_history') {
            await interaction.deferReply({ ephemeral: true });
            const soldOrders = getSoldOrders();
            const totalRevenue = calculateTotalRevenue();
            if (soldOrders.length === 0) {
                return interaction.editReply('Chưa có đơn hàng nào được bán.');
            }
            const embed = new EmbedBuilder()
                .setTitle('Lịch Sử Bán Hàng')
                .setColor(0xF1C40F)
                .setDescription(soldOrders.map(order => 
                    `**Sản phẩm:** ${order.account_name || 'Tài khoản đã bị xóa'}\n` +
                    `**Người mua:** <@${order.buyer_id}>\n` +
                    `**Giá:** ${order.amount.toLocaleString('vi-VN')} VNĐ\n` +
                    `**Thời gian:** <t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:R>`
                ).join('\n\n'))
                .addFields({ name: 'Tổng Doanh Thu', value: `\`${totalRevenue.toLocaleString('vi-VN')} VNĐ\`` });
            await interaction.editReply({ embeds: [embed] });
        }
        else if (customId.startsWith('confirm_delete_')) {
            await interaction.deferUpdate();
            const accountId = customId.split('_')[2];
            if (deleteAccountById(accountId)) { await interaction.editReply({ content: `✅ Đã xóa tài khoản ID: ${accountId}.`, components: [], embeds: [] }); } else { await interaction.editReply({ content: `❌ Không thể xóa tài khoản ID: ${accountId}.`, components: [], embeds: [] }); }
        }
        else if (customId === 'cancel_delete') {
            await interaction.update({ content: 'Hành động xóa đã được hủy.', components: [], embeds: [] });
        }
        else if (customId === 'view_shop') {
            const categoryMenu = new StringSelectMenuBuilder()
                .setCustomId('select_shop_category')
                .setPlaceholder('Vui lòng chọn một danh mục...')
                .addOptions(
                    { label: 'ACC DROPMAIL', value: 'DROPMAIL', description: 'Tài khoản có thể thay đổi email.' },
                    { label: 'ACC DEADMAIL FULL BH', value: 'DEADMAIL', description: 'Tài khoản không thể đổi email, có bảo hành.' }
                );
            const row = new ActionRowBuilder().addComponents(categoryMenu);
            await interaction.reply({ content: 'Bạn muốn xem loại tài khoản nào?', components: [row], ephemeral: true });
        }
        else if (customId.startsWith('shop_nav_')) {
            await interaction.deferUpdate();
            const [, , category, direction, currentIndexStr] = customId.split('_');
            const currentIndex = parseInt(currentIndexStr);
            const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
            const accounts = getAccountsByCategory(category);
            if (newIndex < 0 || newIndex >= accounts.length) return;
            const shopPage = createShopPage(accounts[newIndex], newIndex, accounts.length, category);
            await interaction.editReply(shopPage);
        }
        else if (customId.startsWith('view_images_')) {
            await interaction.deferUpdate();
            const [, , accountId, imageIndexStr] = customId.split('_');
            const imageIndex = parseInt(imageIndexStr);
            const account = getAccountById(accountId);
            if (!account || !account.image_urls) return interaction.editReply({ content: 'Lỗi: Không tìm thấy ảnh.', components: [], embeds: [] });
            const images = JSON.parse(account.image_urls);
            if (imageIndex < 0 || imageIndex >= images.length) return;
            const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setImage(images[imageIndex]);
            const prevIndex = imageIndex - 1;
            const nextIndex = imageIndex + 1;
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`view_images_${accountId}_${prevIndex}`).setLabel('Trước').setStyle(ButtonStyle.Primary).setDisabled(prevIndex < 0),
                    new ButtonBuilder().setCustomId(`view_images_${accountId}_${nextIndex}`).setLabel('Sau').setStyle(ButtonStyle.Primary).setDisabled(nextIndex >= images.length)
                );
            await interaction.editReply({ embeds: [newEmbed], components: [row] });
        }
        else if (customId.startsWith('buy_now_')) {
            await interaction.update({ content: 'Đang xử lý đơn hàng của bạn...', embeds: [], components: [] });
            await interaction.followUp({ content: 'Vui lòng kiểm tra tin nhắn riêng để hoàn tất thanh toán.', ephemeral: true });
            if (pendingPayments.has(interaction.user.id)) {
                await interaction.followUp({ content: 'Bạn đang có một giao dịch đang chờ thanh toán.', ephemeral: true });
                return;
            }
            const accountId = customId.split('_')[2];
            const account = getAccountById(accountId);
            if (!account || account.status !== 'available') {
                await interaction.followUp({ content: 'Tài khoản này đã được bán hoặc không tồn tại.', ephemeral: true });
                return;
            }
            const orderId = `VALO${Date.now()}${interaction.user.id.slice(-4)}`;
            createOrder(orderId, interaction.user.id, account.id, account.price);
            const bankId = process.env.BANK_ID;
            const accountNo = process.env.ACCOUNT_NO;
            const accountName = process.env.ACCOUNT_NAME;
            if (!bankId || !accountNo || !accountName) {
                await interaction.followUp({ content: "Lỗi: Hệ thống thanh toán chưa được cấu hình đầy đủ.", ephemeral: true });
                return;
            }
            const vietQR_URL = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${account.price}&addInfo=${encodeURIComponent(orderId)}&accountName=${encodeURIComponent(accountName)}`;
            const paymentEmbed = new EmbedBuilder().setTitle(`Đơn Hàng: ${account.name}`).setDescription(`Vui lòng thanh toán bằng cách quét mã QR.\n\n**NỘI DUNG CHUYỂN KHOẢN BẮT BUỘC:**`).addFields({ name: 'Nội dung', value: `\`${orderId}\`` }, { name: 'Số tiền', value: `\`${account.price.toLocaleString('vi-VN')} VNĐ\`` }).setImage(vietQR_URL).setColor(0xFFA500).setFooter({ text: 'Bạn có 10 phút để thanh toán.' });
            let paymentMessage;
            try {
                paymentMessage = await interaction.user.send({ embeds: [paymentEmbed] });
            } catch (error) {
                console.error("Lỗi chi tiết khi gửi DM:", error);
                await interaction.followUp({ content: 'Lỗi: Không thể gửi tin nhắn riêng cho bạn.', ephemeral: true });
                updateOrderStatus(orderId, 'cancelled');
                return;
            }
            const checkInterval = setInterval(async () => {
                const transactions = await getRecentTransactions();
                const paidTx = transactions.find(tx => tx.amount === account.price && tx.description.includes(orderId));
                if (paidTx) {
                    clearInterval(checkInterval);
                    pendingPayments.delete(interaction.user.id);
                    updateOrderStatus(orderId, 'paid');
                    updateAccountStatus(account.id, 'sold');
                    paymentMessage.delete().catch(err => console.error("Không thể xóa tin nhắn thanh toán (thành công):", err));
                    const user = decrypt(fromBuffer(account.username));
                    const pass = decrypt(fromBuffer(account.password));
                    const successEmbed = new EmbedBuilder().setTitle('✅ Thanh Toán Thành Công!').setDescription(`Cảm ơn bạn đã mua **${account.name}**. Dưới đây là thông tin đăng nhập:`).addFields({ name: 'Tên đăng nhập', value: `\`${user}\`` }, { name: 'Mật khẩu', value: `\`${pass}\`` }).setColor(0x2ECC71).setFooter({ text: "Vui lòng đổi mật khẩu ngay lập tức." });
                    await interaction.user.send({ embeds: [successEmbed] });
                }
            }, 15 * 1000);
            pendingPayments.set(interaction.user.id, { intervalId: checkInterval, message: paymentMessage, orderId: orderId });
            setTimeout(() => {
                const paymentInfo = pendingPayments.get(interaction.user.id);
                if (paymentInfo && paymentInfo.orderId === orderId) {
                    clearInterval(paymentInfo.intervalId);
                    pendingPayments.delete(interaction.user.id);
                    updateOrderStatus(paymentInfo.orderId, 'cancelled');
                    paymentInfo.message.delete().catch(err => console.error("Không thể xóa tin nhắn thanh toán (hết hạn):", err));
                    interaction.user.send(`Đơn hàng \`${paymentInfo.orderId}\` đã tự động hủy do quá hạn thanh toán.`).catch(() => {});
                }
            }, PAYMENT_TIMEOUT_MS);
        }
    }
    // 3. Xử lý Form (Modal) Submit
    else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('add_account_modal_')) {
            const category = interaction.customId.split('_')[3];
            if (!hasAdminPermission(interaction)) return interaction.reply({ content: 'Bạn không có quyền.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            try {
                const name = interaction.fields.getTextInputValue('name');
                const price = parseInt(interaction.fields.getTextInputValue('price'));
                const description = interaction.fields.getTextInputValue('description');
                const imageUrlsText = interaction.fields.getTextInputValue('imageUrls') || '';
                const credentialsText = interaction.fields.getTextInputValue('credentials');
                const [username, password] = credentialsText.split('\n').map(line => line.trim()).filter(line => line);
                if (!username || !password) { await interaction.editReply({ content: 'Vui lòng nhập Tên đăng nhập và Mật khẩu trên hai dòng riêng biệt.' }); return; }
                const imageUrls = imageUrlsText.split('\n').map(url => url.trim()).filter(url => url);
                const imageUrlsJson = JSON.stringify(imageUrls);
                if (isNaN(price)) { await interaction.editReply('Giá tiền phải là một con số.'); return; }
                const encryptedUsername = encrypt(username);
                const encryptedPassword = encrypt(password);
                addAccount(name, price, description, imageUrlsJson, category, toBuffer(encryptedUsername), toBuffer(encryptedPassword));
                await interaction.editReply({ content: `✅ Đã thêm tài khoản **${category}** thành công!` });
            } catch (error) {
                console.error('Lỗi khi thêm tài khoản:', error);
                await interaction.editReply({ content: '❌ Có lỗi xảy ra khi thêm tài khoản.' });
            }
        }
    }
    // 4. Xử lý Menu Lựa Chọn
    else if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;
        if (customId === 'select_shop_category') {
            await interaction.deferUpdate();
            const selectedCategory = interaction.values[0];
            const accounts = getAccountsByCategory(selectedCategory);
            if (accounts.length === 0) {
                return interaction.editReply({ content: `Hiện không có tài khoản nào thuộc loại **${selectedCategory}**.`, components: [] });
            }
            const shopPage = createShopPage(accounts[0], 0, accounts.length, selectedCategory);
            await interaction.editReply(shopPage);
        }
        else if (customId === 'select_account_to_manage') {
            if (!hasAdminPermission(interaction)) { return interaction.reply({ content: 'Bạn không có quyền.', ephemeral: true });}
            await interaction.deferUpdate();
            const accountId = interaction.values[0];
            const account = getAccountById(accountId);
            if (!account) { await interaction.editReply({ content: 'Không tìm thấy tài khoản.', components: [] }); return; }
            const embed = new EmbedBuilder().setTitle(`Quản lý: ${account.name}`).addFields({ name: 'ID', value: account.id.toString(), inline: true }, { name: 'Giá', value: `${account.price.toLocaleString('vi-VN')} VNĐ`, inline: true }, { name: 'Trạng thái', value: account.status, inline: true });
            const confirmButton = new ButtonBuilder().setCustomId(`confirm_delete_${account.id}`).setLabel("Xác Nhận Xóa").setStyle(ButtonStyle.Danger);
            const cancelButton = new ButtonBuilder().setCustomId('cancel_delete').setLabel("Hủy").setStyle(ButtonStyle.Secondary);
            await interaction.editReply({ content: `Bạn có chắc chắn muốn xóa tài khoản này không?`, embeds: [embed], components: [new ActionRowBuilder().addComponents(confirmButton, cancelButton)] });
        }
    }
});

keepAlive();
client.login(process.env.DISCORD_TOKEN);