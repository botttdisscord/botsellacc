require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const { addAccount, getAllAccounts, getAccountById, deleteAccountById, createOrder, findPendingOrderByUser, updateOrderStatus, updateAccountStatus, getSoldOrders, calculateTotalRevenue, getAccountsByCategory, addCoupon, getCoupon, useCoupon, getAllCoupons } = require('./utils/database');
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
const userAppliedCoupons = new Map();
const PAYMENT_TIMEOUT_MS = 10 * 60 * 1000;

function hasAdminPermission(interaction) {
    const adminRoleIds = (process.env.ADMIN_ROLE_IDS || '').split(',').map(id => id.trim()).filter(id => id);
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (adminRoleIds.length > 0 && adminRoleIds.some(roleId => interaction.member.roles.cache.has(roleId))) return true;
    return false;
}

client.once(Events.ClientReady, c => console.log(`✅ Ready! Logged in as ${c.user.tag}`));

function createShopPage(account, pageIndex, totalPages, category) {
    const shopEmbed = new EmbedBuilder().setTitle(account.name).setDescription(account.description || 'Không có mô tả cho sản phẩm này.').setColor(0x3498DB).addFields({ name: 'Giá bán', value: `${account.price.toLocaleString('vi-VN')} VNĐ` }).setFooter({ text: `Sản phẩm ${pageIndex + 1} / ${totalPages} | ID: ${account.id}` });
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
    const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`buy_now_${account.id}`).setLabel('Mua Ngay').setStyle(ButtonStyle.Success).setEmoji('💳'));
    if (images.length > 1) {
        actionRow.addComponents(new ButtonBuilder().setCustomId(`view_images_${account.id}_0`).setLabel('Xem Ảnh').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'));
    }
    return { embeds: [shopEmbed], components: [navigationRow, actionRow] };
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            if (command.data.name === 'admin_panel' || command.data.name === 'setup_shop') {
                if (!hasAdminPermission(interaction)) return interaction.reply({ content: 'Bạn không có quyền.', ephemeral: true });
            }
            await command.execute(interaction);
        }
        else if (interaction.isButton()) {
            const customId = interaction.customId;
            const isAdminInteraction = customId.startsWith('admin_');
            if (isAdminInteraction && !hasAdminPermission(interaction)) {
                return interaction.reply({ content: 'Bạn không có quyền.', ephemeral: true });
            }
            if (customId === 'admin_add_account') {
                const embed = new EmbedBuilder().setTitle('Chọn Loại Tài Khoản').setDescription('Vui lòng chọn loại tài khoản bạn muốn thêm.').setColor(0x5865F2);
                const dropmailButton = new ButtonBuilder().setCustomId('admin_add_category_DROPMAIL').setLabel('ACC DROPMAIL').setStyle(ButtonStyle.Success);
                const deadmailButton = new ButtonBuilder().setCustomId('admin_add_category_DEADMAIL').setLabel('ACC DEADMAIL FULL BH').setStyle(ButtonStyle.Danger);
                await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(dropmailButton, deadmailButton)], ephemeral: true });
            }
            else if (customId.startsWith('admin_add_category_')) {
                const category = customId.split('_')[3];
                const modal = new ModalBuilder().setCustomId(`add_account_modal_${category}`).setTitle(`Thêm: ${category}`);
                const nameInput = new TextInputBuilder().setCustomId('name').setLabel("Tên sản phẩm").setStyle(TextInputStyle.Short).setRequired(true);
                const priceInput = new TextInputBuilder().setCustomId('price').setLabel("Giá bán (chỉ nhập số)").setStyle(TextInputStyle.Short).setRequired(true);
                const descriptionInput = new TextInputBuilder().setCustomId('description').setLabel("Mô tả chi tiết").setStyle(TextInputStyle.Paragraph).setRequired(true);
                const imageUrlsInput = new TextInputBuilder().setCustomId('imageUrls').setLabel("Các link ảnh (mỗi link một dòng)").setStyle(TextInputStyle.Paragraph).setRequired(false);
                const credentialsInput = new TextInputBuilder().setCustomId('credentials').setLabel("Tài khoản & Mật khẩu (dòng 1: tk, dòng 2: mk)").setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(priceInput), new ActionRowBuilder().addComponents(descriptionInput), new ActionRowBuilder().addComponents(imageUrlsInput), new ActionRowBuilder().addComponents(credentialsInput));
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
                if (soldOrders.length === 0) return interaction.editReply('Chưa có đơn hàng nào được bán.');
                const embed = new EmbedBuilder().setTitle('Lịch Sử Bán Hàng').setColor(0xF1C40F)
                    .setDescription(soldOrders.map(order => 
                        `**Sản phẩm:** ${order.account_name || 'Tài khoản đã bị xóa'}\n` +
                        `**Người mua:** <@${order.buyer_id}> | **Phương thức:** ${order.payment_method}\n` +
                        `**Giá:** ${order.amount.toLocaleString('vi-VN')} VNĐ | **Coupon:** ${order.coupon_code || 'Không'}\n` +
                        `**Thời gian:** <t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:R>`
                    ).join('\n\n'))
                    .addFields({ name: 'Tổng Doanh Thu', value: `\`${totalRevenue.toLocaleString('vi-VN')} VNĐ\`` });
                await interaction.editReply({ embeds: [embed] });
            }
            else if (customId === 'admin_manage_coupons') {
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin_create_coupon').setLabel('Tạo Coupon Mới').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('admin_list_coupons').setLabel('Xem Tất Cả Coupon').setStyle(ButtonStyle.Secondary));
                await interaction.reply({ content: 'Vui lòng chọn một hành động:', components: [row], ephemeral: true });
            }
            else if (customId === 'admin_create_coupon') {
                const modal = new ModalBuilder().setCustomId('create_coupon_modal').setTitle('Tạo Mã Giảm Giá Mới');
                const codeInput = new TextInputBuilder().setCustomId('coupon_code').setLabel("Mã coupon (VD: GIAMGIA10)").setStyle(TextInputStyle.Short).setRequired(true);
                const discountInput = new TextInputBuilder().setCustomId('coupon_discount').setLabel("Phần trăm giảm giá (chỉ nhập số)").setStyle(TextInputStyle.Short).setRequired(true);
                const usesInput = new TextInputBuilder().setCustomId('coupon_uses').setLabel("Số lượt dùng (1, 2, hoặc 'vohan' cho vô hạn)").setStyle(TextInputStyle.Short).setRequired(true);
                const expiryInput = new TextInputBuilder().setCustomId('coupon_expiry').setLabel("Thời gian hiệu lực (VD: 7d, 24h, 30m)").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(codeInput), new ActionRowBuilder().addComponents(discountInput), new ActionRowBuilder().addComponents(usesInput), new ActionRowBuilder().addComponents(expiryInput));
                await interaction.showModal(modal);
            }
            else if (customId === 'admin_list_coupons') {
                await interaction.deferReply({ ephemeral: true });
                const coupons = getAllCoupons();
                if (coupons.length === 0) return interaction.editReply('Chưa có coupon nào được tạo.');
                const embed = new EmbedBuilder().setTitle('Danh sách Mã Giảm Giá').setColor(0x9B59B6);
                coupons.forEach(c => {
                    const expiry = c.expiry_date ? `<t:${Math.floor(new Date(c.expiry_date).getTime() / 1000)}:R>` : 'Không hết hạn';
                    const uses = c.uses_left === -1 ? 'Vô hạn' : c.uses_left;
                    embed.addFields({ name: `Mã: \`${c.code}\``, value: `Giảm: ${c.discount_percentage}% | Lượt dùng: ${uses} | Hết hạn: ${expiry}` });
                });
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
                const categoryMenu = new StringSelectMenuBuilder().setCustomId('select_shop_category').setPlaceholder('Vui lòng chọn một danh mục...').addOptions({ label: 'ACC DROPMAIL', value: 'DROPMAIL' }, { label: 'ACC DEADMAIL FULL BH', value: 'DEADMAIL' });
                await interaction.reply({ content: 'Bạn muốn xem loại tài khoản nào?', components: [new ActionRowBuilder().addComponents(categoryMenu)], ephemeral: true });
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
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`view_images_${accountId}_${prevIndex}`).setLabel('Trước').setStyle(ButtonStyle.Primary).setDisabled(prevIndex < 0), new ButtonBuilder().setCustomId(`view_images_${accountId}_${nextIndex}`).setLabel('Sau').setStyle(ButtonStyle.Primary).setDisabled(nextIndex >= images.length));
                await interaction.editReply({ embeds: [newEmbed], components: [row] });
            }
            else if (customId.startsWith('buy_now_')) {
                await interaction.update({ content: 'Đang xử lý...', embeds: [], components: [] });
                const accountId = customId.split('_')[2];
                const account = getAccountById(accountId);
                if (!account) return interaction.followUp({ content: 'Lỗi: Tài khoản không tồn tại.', ephemeral: true });
                const paymentChoiceEmbed = new EmbedBuilder().setTitle(`Thanh toán cho: ${account.name}`).setDescription(`Vui lòng chọn phương thức thanh toán của bạn.\n**Giá:** ${account.price.toLocaleString('vi-VN')} VNĐ`).setColor(0xFFA500);
                const choiceRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`pay_bank_${accountId}`).setLabel('Chuyển khoản (VietQR)').setStyle(ButtonStyle.Success).setEmoji('🏦'),
                    new ButtonBuilder().setCustomId(`pay_card_${accountId}`).setLabel('Thẻ cào điện thoại').setStyle(ButtonStyle.Primary).setEmoji('📱'),
                    new ButtonBuilder().setCustomId(`apply_coupon_${accountId}`).setLabel('Áp dụng Coupon').setStyle(ButtonStyle.Secondary).setEmoji('🎟️')
                );
                await interaction.followUp({ embeds: [paymentChoiceEmbed], components: [choiceRow], ephemeral: true });
            }
            else if (customId.startsWith('pay_bank_')) {
                await interaction.update({ content: 'Đang tạo mã QR, vui lòng chờ...', components: [], embeds: [] });
                if (pendingPayments.has(interaction.user.id)) return interaction.followUp({ content: 'Bạn đang có một giao dịch đang chờ.', ephemeral: true });
                const accountId = customId.split('_')[2];
                const account = getAccountById(accountId);
                if (!account || account.status !== 'available') return interaction.followUp({ content: 'Tài khoản này đã được bán.', ephemeral: true });
                const appliedCoupon = userAppliedCoupons.get(interaction.user.id);
                let finalPrice = account.price;
                if (appliedCoupon) {
                    finalPrice -= Math.floor(account.price * (appliedCoupon.discount_percentage / 100));
                    finalPrice = Math.max(0, finalPrice);
                }
                const orderId = `VALO${Date.now()}`;
                createOrder(orderId, interaction.user.id, account.id, finalPrice, 'bank', appliedCoupon?.code);
                const bankId = process.env.BANK_ID, accountNo = process.env.ACCOUNT_NO, accountName = process.env.ACCOUNT_NAME;
                if (!bankId || !accountNo || !accountName) return interaction.followUp({ content: "Lỗi: Hệ thống thanh toán chưa được cấu hình.", ephemeral: true });
                const vietQR_URL = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${finalPrice}&addInfo=${encodeURIComponent(orderId)}&accountName=${encodeURIComponent(accountName)}`;
                const paymentEmbed = new EmbedBuilder().setTitle(`Đơn Hàng: ${account.name}`).setDescription(`Vui lòng thanh toán bằng cách quét mã QR.\n\n**NỘI DUNG CHUYỂN KHOẢN BẮT BUỘC:**`).addFields({ name: 'Nội dung', value: `\`${orderId}\`` }, { name: 'Số tiền', value: `\`${finalPrice.toLocaleString('vi-VN')} VNĐ\`` }).setImage(vietQR_URL).setColor(0xFFA500).setFooter({ text: 'Bạn có 10 phút để thanh toán.' });
                let paymentMessage;
                try {
                    paymentMessage = await interaction.user.send({ embeds: [paymentEmbed] });
                    await interaction.followUp({ content: `Đã gửi hướng dẫn thanh toán vào tin nhắn riêng của bạn!`, ephemeral: true });
                } catch (error) {
                    console.error("Lỗi gửi DM:", error);
                    await interaction.followUp({ content: 'Lỗi: Không thể gửi tin nhắn riêng cho bạn.', ephemeral: true });
                    updateOrderStatus(orderId, 'cancelled'); return;
                }
                const checkInterval = setInterval(async () => {
                    const transactions = await getRecentTransactions();
                    const paidTx = transactions.find(tx => tx.amount === finalPrice && tx.description.includes(orderId));
                    if (paidTx) {
                        clearInterval(checkInterval);
                        pendingPayments.delete(interaction.user.id);
                        if(appliedCoupon) useCoupon(appliedCoupon.code);
                        userAppliedCoupons.delete(interaction.user.id);
                        updateOrderStatus(orderId, 'paid');
                        updateAccountStatus(account.id, 'sold');
                        paymentMessage.delete().catch(console.error);
                        const user = decrypt(fromBuffer(account.username)), pass = decrypt(fromBuffer(account.password));
                        const successEmbed = new EmbedBuilder().setTitle('✅ Thanh Toán Thành Công!').setDescription(`Cảm ơn bạn đã mua **${account.name}**. Dưới đây là thông tin đăng nhập:`).addFields({ name: 'Tên đăng nhập', value: `\`${user}\`` }, { name: 'Mật khẩu', value: `\`${pass}\`` }).setColor(0x2ECC71);
                        await interaction.user.send({ embeds: [successEmbed] });
                    }
                }, 15000);
                pendingPayments.set(interaction.user.id, { intervalId: checkInterval, message: paymentMessage, orderId: orderId });
                setTimeout(() => {
                    const paymentInfo = pendingPayments.get(interaction.user.id);
                    if (paymentInfo && paymentInfo.orderId === orderId) {
                        clearInterval(paymentInfo.intervalId);
                        pendingPayments.delete(interaction.user.id);
                        userAppliedCoupons.delete(interaction.user.id);
                        updateOrderStatus(paymentInfo.orderId, 'cancelled');
                        paymentInfo.message.delete().catch(console.error);
                        interaction.user.send(`Đơn hàng \`${paymentInfo.orderId}\` đã tự động hủy do quá hạn.`).catch(() => {});
                    }
                }, PAYMENT_TIMEOUT_MS);
            }
            else if (customId.startsWith('pay_card_')) {
                const accountId = customId.split('_')[2];
                const cardModal = new ModalBuilder().setCustomId(`submit_card_${accountId}`).setTitle('Thanh toán bằng Thẻ Cào');
                const cardTypeInput = new TextInputBuilder().setCustomId('card_type').setLabel("Nhà mạng (Viettel, Vinaphone, Mobifone)").setStyle(TextInputStyle.Short).setRequired(true);
                const serialInput = new TextInputBuilder().setCustomId('card_serial').setLabel("Số Seri").setStyle(TextInputStyle.Short).setRequired(true);
                const pinInput = new TextInputBuilder().setCustomId('card_pin').setLabel("Mã thẻ").setStyle(TextInputStyle.Short).setRequired(true);
                cardModal.addComponents(new ActionRowBuilder().addComponents(cardTypeInput), new ActionRowBuilder().addComponents(serialInput), new ActionRowBuilder().addComponents(pinInput));
                await interaction.showModal(cardModal);
            }
            else if (customId.startsWith('apply_coupon_')) {
                const accountId = customId.split('_')[2];
                const modal = new ModalBuilder().setCustomId(`submit_coupon_${accountId}`).setTitle('Áp Dụng Mã Giảm Giá');
                const codeInput = new TextInputBuilder().setCustomId('coupon_code').setLabel("Nhập mã giảm giá của bạn").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
                await interaction.showModal(modal);
            }
        }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('add_account_modal_')) {
                const category = interaction.customId.split('_')[3];
                if (!hasAdminPermission(interaction)) return;
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
                    addAccount(name, price, description, imageUrlsJson, category, toBuffer(encrypt(username)), toBuffer(encrypt(password)));
                    await interaction.editReply({ content: `✅ Đã thêm tài khoản **${category}** thành công!` });
                } catch (error) {
                    console.error('Lỗi khi thêm tài khoản:', error);
                    await interaction.editReply({ content: '❌ Có lỗi xảy ra khi thêm tài khoản.' });
                }
            }
            else if (interaction.customId === 'create_coupon_modal') {
                if (!hasAdminPermission(interaction)) return;
                await interaction.deferReply({ ephemeral: true });
                try {
                    const code = interaction.fields.getTextInputValue('coupon_code');
                    const discount = parseInt(interaction.fields.getTextInputValue('coupon_discount'));
                    const usesRaw = interaction.fields.getTextInputValue('coupon_uses').toLowerCase();
                    const expiryRaw = interaction.fields.getTextInputValue('coupon_expiry').toLowerCase();
                    const uses = usesRaw === 'vohan' ? -1 : parseInt(usesRaw);
                    if (isNaN(discount) || isNaN(uses)) return interaction.editReply("Giảm giá và lượt dùng phải là số (hoặc 'vohan').");
                    let expiryDate = null;
                    if (expiryRaw) {
                        const duration = parseInt(expiryRaw.slice(0, -1));
                        const unit = expiryRaw.slice(-1);
                        if (isNaN(duration)) return interaction.editReply("Thời gian hiệu lực không hợp lệ.");
                        expiryDate = new Date();
                        if (unit === 'd') expiryDate.setDate(expiryDate.getDate() + duration);
                        else if (unit === 'h') expiryDate.setHours(expiryDate.getHours() + duration);
                        else if (unit === 'm') expiryDate.setMinutes(expiryDate.getMinutes() + duration);
                        else return interaction.editReply("Đơn vị thời gian không hợp lệ (d, h, m).");
                    }
                    addCoupon(code, discount, uses, expiryDate ? expiryDate.toISOString() : null);
                    await interaction.editReply(`✅ Đã tạo thành công coupon \`${code.toUpperCase()}\`!`);
                } catch (error) {
                    console.error(error);
                    await interaction.editReply('❌ Lỗi: Mã coupon này có thể đã tồn tại.');
                }
            }
            else if (interaction.customId.startsWith('submit_card_')) {
                await interaction.deferReply({ ephemeral: true });
                const accountId = interaction.customId.split('_')[2];
                const account = getAccountById(accountId);
                if (!account || account.status !== 'available') return interaction.editReply('Tài khoản này đã được bán.');
                const cardType = interaction.fields.getTextInputValue('card_type');
                const serial = interaction.fields.getTextInputValue('card_serial');
                const pin = interaction.fields.getTextInputValue('card_pin');
                await interaction.editReply(`Đang xử lý thẻ **${cardType}**...`);
                setTimeout(async () => {
                    const isSuccess = true;
                    if (isSuccess) {
                        const orderId = `CARD${Date.now()}`;
                        createOrder(orderId, interaction.user.id, account.id, account.price, 'card', null);
                        updateOrderStatus(orderId, 'paid');
                        updateAccountStatus(account.id, 'sold');
                        const user = decrypt(fromBuffer(account.username)), pass = decrypt(fromBuffer(account.password));
                        const successEmbed = new EmbedBuilder().setTitle('✅ Giao dịch thành công!').setDescription(`Cảm ơn bạn đã mua **${account.name}**. Dưới đây là thông tin đăng nhập:`).addFields({ name: 'Tên đăng nhập', value: `\`${user}\`` }, { name: 'Mật khẩu', value: `\`${pass}\`` }).setColor(0x2ECC71);
                        try {
                            await interaction.user.send({ embeds: [successEmbed] });
                            await interaction.editReply('Thanh toán thành công! Vui lòng kiểm tra tin nhắn riêng.');
                        } catch (e) { await interaction.editReply('Thanh toán thành công nhưng không thể gửi tin nhắn riêng.'); }
                    }
                }, 5000);
            }
            else if (interaction.customId.startsWith('submit_coupon_')) {
                await interaction.deferUpdate();
                const accountId = interaction.customId.split('_')[2];
                const code = interaction.fields.getTextInputValue('coupon_code');
                const coupon = getCoupon(code);
                const account = getAccountById(accountId);
                if (!coupon || coupon.uses_left === 0) return interaction.followUp({ content: 'Mã giảm giá không hợp lệ hoặc đã hết lượt.', ephemeral: true });
                if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) return interaction.followUp({ content: 'Mã giảm giá đã hết hạn.', ephemeral: true });
                
                let finalPrice = account.price;
                let discountAmount = 0;
                if (coupon.discount_percentage >= 100) {
                    finalPrice = 0;
                    discountAmount = account.price;
                } else {
                    discountAmount = Math.floor(account.price * (coupon.discount_percentage / 100));
                    finalPrice = account.price - discountAmount;
                }

                if (finalPrice <= 0) {
                    await interaction.editReply({ content: `Đang xử lý tài khoản miễn phí với coupon **${coupon.code}**...`, components: [], embeds: [] });
                    
                    const orderId = `COUPON${Date.now()}`;
                    createOrder(orderId, interaction.user.id, account.id, 0, 'coupon', coupon.code);
                    updateOrderStatus(orderId, 'paid');
                    updateAccountStatus(account.id, 'sold');
                    useCoupon(coupon.code);

                    const user = decrypt(fromBuffer(account.username));
                    const pass = decrypt(fromBuffer(account.password));
                    const successEmbed = new EmbedBuilder().setTitle('✅ Nhận Tài Khoản Thành Công!').setDescription(`Bạn đã sử dụng coupon và nhận thành công **${account.name}**. Dưới đây là thông tin đăng nhập:`).addFields({ name: 'Tên đăng nhập', value: `\`${user}\`` }, { name: 'Mật khẩu', value: `\`${pass}\`` }).setColor(0x2ECC71);
                    
                    try {
                        await interaction.user.send({ embeds: [successEmbed] });
                        await interaction.followUp({ content: 'Nhận tài khoản thành công! Vui lòng kiểm tra tin nhắn riêng.', ephemeral: true });
                    } catch (e) {
                        await interaction.followUp({ content: 'Nhận tài khoản thành công nhưng không thể gửi tin nhắn riêng. Vui lòng liên hệ admin.', ephemeral: true });
                    }
                } else {
                    userAppliedCoupons.set(interaction.user.id, coupon);
                    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFields({ name: 'Giá gốc', value: `~~${account.price.toLocaleString('vi-VN')} VNĐ~~` }, { name: 'Giảm giá', value: `- ${discountAmount.toLocaleString('vi-VN')} VNĐ` }, { name: 'Giá cuối cùng', value: `**${finalPrice.toLocaleString('vi-VN')} VNĐ**` }).setColor(0x2ECC71);
                    const newComponents = interaction.message.components.map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(button => {
                            const newButton = ButtonBuilder.from(button);
                            if (button.customId.startsWith('apply_coupon')) newButton.setDisabled(true).setLabel(`Đã áp dụng: ${coupon.code}`).setStyle(ButtonStyle.Secondary);
                            newRow.addComponents(newButton);
                        });
                        return newRow;
                    });
                    await interaction.editReply({ embeds: [updatedEmbed], components: newComponents });
                }
            }
        }
        else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            if (customId === 'select_shop_category') {
                await interaction.deferUpdate();
                const selectedCategory = interaction.values[0];
                const accounts = getAccountsByCategory(selectedCategory);
                if (accounts.length === 0) return interaction.editReply({ content: `Hiện không có tài khoản nào thuộc loại **${selectedCategory}**.`, components: [] });
                const shopPage = createShopPage(accounts[0], 0, accounts.length, selectedCategory);
                await interaction.editReply(shopPage);
            }
            else if (customId === 'select_account_to_manage') {
                if (!hasAdminPermission(interaction)) return;
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
    } catch (error) {
        console.error("Unhandled Interaction Error:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Đã có lỗi không mong muốn xảy ra!', ephemeral: true }).catch(console.error);
        } else {
            await interaction.reply({ content: 'Đã có lỗi không mong muốn xảy ra!', ephemeral: true }).catch(console.error);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
