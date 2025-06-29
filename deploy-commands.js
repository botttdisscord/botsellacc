require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const BOT_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("Lỗi: Không tìm thấy DISCORD_TOKEN, CLIENT_ID, hoặc GUILD_ID. Vui lòng kiểm tra lại file .env của bạn.");
    process.exit(1);
}

const commands = [];
const foldersPath = path.join(__dirname, 'src/commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }
}

const rest = new REST().setToken(BOT_TOKEN);

(async () => {
    try {
        console.log(`Bắt đầu đăng ký ${commands.length} lệnh (/) lên Discord.`);
        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log(`✅ Đã đăng ký thành công ${data.length} lệnh.`);
    } catch (error) {
        console.error(error);
    }
})();
