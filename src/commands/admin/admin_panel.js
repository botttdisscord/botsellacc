const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin_panel')
        .setDescription('Hiển thị bảng điều khiển dành cho quản trị viên.'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Bảng Điều Khiển Admin')
            .setDescription('Sử dụng các nút bên dưới để quản lý cửa hàng của bạn.')
            .setColor(0x5865F2)
            .setTimestamp();

        const addAccountButton = new ButtonBuilder().setCustomId('admin_add_account').setLabel('Thêm Tài Khoản').setStyle(ButtonStyle.Success).setEmoji('➕');
        const manageInventoryButton = new ButtonBuilder().setCustomId('admin_manage_inventory').setLabel('Quản Lý Kho').setStyle(ButtonStyle.Primary).setEmoji('⚙️');
        const salesHistoryButton = new ButtonBuilder().setCustomId('admin_sales_history').setLabel('Lịch Sử Bán Hàng').setStyle(ButtonStyle.Secondary).setEmoji('📊');

        const row = new ActionRowBuilder().addComponents(addAccountButton, manageInventoryButton, salesHistoryButton);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    },
};