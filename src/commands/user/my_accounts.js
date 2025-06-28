const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPurchaseHistory } = require('../../utils/database');
const { decrypt, fromBuffer } = require('../../utils/encryption');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('my_accounts')
        .setDescription('Xem lại danh sách các tài khoản bạn đã mua.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const history = getPurchaseHistory(interaction.user.id);

        if (!history || history.length === 0) {
            return interaction.editReply('Bạn chưa mua tài khoản nào từ cửa hàng.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Lịch Sử Mua Hàng Của Bạn')
            .setColor(0x1ABC9C)
            .setDescription('Dưới đây là thông tin các tài khoản bạn đã mua. Vui lòng không chia sẻ thông tin này.');

        for (const acc of history) {
            try {
                const username = decrypt(fromBuffer(acc.username));
                const password = decrypt(fromBuffer(acc.password));
                embed.addFields({
                    name: `Sản phẩm: ${acc.name}`,
                    value: `Tài khoản: \`${username}\`\nMật khẩu: \`${password}\``
                });
            } catch (e) {
                console.error("Lỗi giải mã khi xem lịch sử:", e);
                embed.addFields({
                    name: `Sản phẩm: ${acc.name}`,
                    value: 'Lỗi khi giải mã thông tin tài khoản.'
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
