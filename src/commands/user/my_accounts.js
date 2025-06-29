const { SlashCommandBuilder: SlashCommandBuilderUser, EmbedBuilder: EmbedBuilderUser } = require('discord.js');
const { getPurchaseHistory: getPurchaseHistoryUser } = require('../../utils/database');
const { decrypt: decryptUser, fromBuffer: fromBufferUser } = require('../../utils/encryption');
module.exports = {
    data: new SlashCommandBuilderUser().setName('my_accounts').setDescription('Xem lại các tài khoản bạn đã mua.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const history = getPurchaseHistoryUser(interaction.user.id);
        if (!history || history.length === 0) return interaction.editReply('Bạn chưa mua tài khoản nào.');
        const embed = new EmbedBuilderUser().setTitle('Lịch Sử Mua Hàng Của Bạn').setColor(0x1ABC9C).setDescription('Dưới đây là thông tin các tài khoản bạn đã mua.');
        for (const acc of history) {
            try {
                const username = decryptUser(fromBufferUser(acc.username));
                const password = decryptUser(fromBufferUser(acc.password));
                embed.addFields({ name: `Sản phẩm: ${acc.name}`, value: `Tài khoản: \`${username}\`\nMật khẩu: \`${password}\`` });
            } catch (e) { console.error("Lỗi giải mã khi xem lịch sử:", e); embed.addFields({ name: `Sản phẩm: ${acc.name}`, value: 'Lỗi khi giải mã thông tin tài khoản.' }); }
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
