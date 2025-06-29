const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('admin_panel').setDescription('Hiển thị bảng điều khiển của quản trị viên.'),
    async execute(interaction) {
        const embed = new EmbedBuilder().setTitle('Bảng Điều Khiển Admin').setDescription('Sử dụng các nút bên dưới để quản lý cửa hàng.').setColor(0x5865F2);
        const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin_add_account').setLabel('Thêm Tài Khoản').setStyle(ButtonStyle.Success).setEmoji('➕'), new ButtonBuilder().setCustomId('admin_manage_inventory').setLabel('Quản Lý Kho').setStyle(ButtonStyle.Primary).setEmoji('⚙️'));
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin_sales_history').setLabel('Lịch Sử Bán Hàng').setStyle(ButtonStyle.Secondary).setEmoji('📊'), new ButtonBuilder().setCustomId('admin_manage_coupons').setLabel('Quản Lý Coupon').setStyle(ButtonStyle.Danger).setEmoji('🎟️'));
        await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    },
};
