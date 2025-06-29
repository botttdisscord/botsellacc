const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup_shop')
        .setDescription('Thiết lập tin nhắn cửa hàng trong một kênh.')
        .addChannelOption(option =>
            option.setName('channel').setDescription('Kênh để gửi tin nhắn.').addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const embed = new EmbedBuilder()
            .setTitle('Valorant Account Shop')
            .setDescription('Chào mừng đến với cửa hàng bán tài khoản Valorant tự động!\n\nNhấn nút bên dưới để xem tất cả các tài khoản hiện có.')
            .setColor(0x2ECC71)
            .setImage('https://placehold.co/600x200/2c2f34/ffffff?text=Valorant+Shop&font=lato');
        const viewShopButton = new ButtonBuilder().setCustomId('view_shop').setLabel('Xem Cửa Hàng').setStyle(ButtonStyle.Success).setEmoji('🛍️');
        try {
            await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(viewShopButton)] });
            await interaction.reply({ content: `✅ Đã gửi tin nhắn cửa hàng thành công đến kênh ${channel}.`, ephemeral: true });
        } catch (error) {
            console.error('Lỗi khi gửi tin nhắn setup shop:', error);
            await interaction.reply({ content: '❌ Tôi không có quyền gửi tin nhắn trong kênh đó.', ephemeral: true });
        }
    },
};
