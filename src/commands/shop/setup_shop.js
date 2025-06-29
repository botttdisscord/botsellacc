const { SlashCommandBuilder: SlashCommandBuilderShop, EmbedBuilder: EmbedBuilderShop, ActionRowBuilder: ActionRowBuilderShop, ButtonBuilder: ButtonBuilderShop, ButtonStyle: ButtonStyleShop, ChannelType: ChannelTypeShop } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilderShop().setName('setup_shop').setDescription('Thiết lập tin nhắn cửa hàng trong một kênh.').addChannelOption(option => option.setName('channel').setDescription('Kênh để gửi tin nhắn.').addChannelTypes(ChannelTypeShop.GuildText).setRequired(true)),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const embed = new EmbedBuilderShop().setTitle('Valorant Account Shop').setDescription('Chào mừng đến với cửa hàng!\n\nNhấn nút bên dưới để xem các sản phẩm.').setColor(0x2ECC71).setImage('https://placehold.co/600x200/2c2f34/ffffff?text=Valorant+Shop&font=lato');
        const viewShopButton = new ButtonBuilderShop().setCustomId('view_shop').setLabel('Xem Cửa Hàng').setStyle(ButtonStyleShop.Success).setEmoji('🛍️');
        try {
            await channel.send({ embeds: [embed], components: [new ActionRowBuilderShop().addComponents(viewShopButton)] });
            await interaction.reply({ content: `✅ Đã gửi tin nhắn cửa hàng đến kênh ${channel}.`, ephemeral: true });
        } catch (error) { console.error('Lỗi khi gửi tin nhắn setup shop:', error); await interaction.reply({ content: '❌ Tôi không có quyền gửi tin nhắn trong kênh đó.', ephemeral: true }); }
    },
};
