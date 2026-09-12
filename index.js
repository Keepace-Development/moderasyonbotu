require('dotenv').config();
// --- SİSTEM HATA YAKALAYICILARI (BOTUN ÇÖKMESİNİ ENGELLER) ---
process.on('unhandledRejection', (reason, promise) => {
    console.error(' [Hata Yakalandı - unhandledRejection]:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error(' [Hata Yakalandı - uncaughtException]:', err);
});
// -----------------------------------------------------------

// --- RENDER ZAMAN AŞIMI ENGELLEYİCİ (SAHTE WEB SUNUCUSU) ---
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot 7/24 Aktif!'));
app.listen(port, () => console.log(`🌐 Web sunucusu ${port} portunda dinlemede.`));
// -----------------------------------------------------------

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// KÜFÜR FİLTRESİ VE OPTİMİZE REGEX (PERFORMANS İÇİN DIŞARIDA DERLENDİ)
const bannedWords = ['amk', 'aq', 'oç', 'piç', 'sik', 'yarrak', 'puşt', 'ibne'];
const badWordsRegex = new RegExp(`\\b(${bannedWords.join('|')})\\b`, 'i');
const linkRegex = /(https?:\/\/|discord\.gg\/|discord\.com\/invite|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i;

// GIF LİNKLERİNİ (Discord GIF picker, Tenor, Giphy) reklam/link engelinden muaf tutmak için
const gifRegex = /(tenor\.com|giphy\.com|media\.discordapp\.net.*\.gif|cdn\.discordapp\.com.*\.gif|\.gif(\?|$))/i;

// DAVET LİNKLERİ - BUNLAR HERKES İÇİN (BYPASS ROLLERİ DAHİL) HER ZAMAN YASAK
const inviteRegex = /(discord\.gg\/|discord(app)?\.com\/invite\/)/i;

// LİNK FİLTRESİNDEN MUAF ROLLER (davet linki hariç - gif ve diğer linkleri atabilirler)
const filterBypassRoles = ['100. Seviye', 'gifyetki'];

// ==========================================
// 🏷️ SUNUCU ETİKETİ (SERVER TAG / PRIMARY GUILD) YARDIMCI FONKSİYONLARI
// ==========================================
// NOT: Bu özellik Discord'un "Sunucu Etiketi" (profildeki 4 haneli rozet) alanını kullanır.
// discord.js kütüphanesinin bu alanı (user.primaryGuild) desteklemesi için
// discord.js sürümünüzün güncel olması gerekir (14.21+ / ideal olarak en güncel sürüm).
function hasServerTag(member) {
    try {
        const pg = member?.user?.primaryGuild;
        if (!pg) return false;
        return !!(pg.identityEnabled && pg.identityGuildId === member.guild.id);
    } catch (err) {
        return false;
    }
}

// ==========================================
// ⏱️ SÜRE PARSE EDİCİ (!mute KOMUTU İÇİN) — Örn: 10dk, 1sa, 30sn, 2gün
// ==========================================
function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)\s*(sn|s|dk|dakika|sa|saat|gün|gun|g)$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === 'sn' || unit === 's') return value * 1000;
    if (unit === 'dk' || unit === 'dakika') return value * 60 * 1000;
    if (unit === 'sa' || unit === 'saat') return value * 60 * 60 * 1000;
    if (unit === 'gün' || unit === 'gun' || unit === 'g') return value * 24 * 60 * 60 * 1000;

    return null;
}

async function syncTagRole(member) {
    if (!member || member.user.bot) return;

    const guildId = member.guild.id;
    const tagRoleId = await db.get(`tagrole_${guildId}`);
    if (!tagRoleId) return;

    const role = member.guild.roles.cache.get(tagRoleId);
    if (!role) return;

    const hasTag = hasServerTag(member);
    const hasRole = member.roles.cache.has(role.id);

    try {
        if (hasTag && !hasRole) {
            await member.roles.add(role);
        } else if (!hasTag && hasRole) {
            await member.roles.remove(role);
        }
    } catch (err) {
        console.log(`[Etiket Rol Hatası] ${member.user.tag} için rol güncellenemedi: ${err.message}`);
    }
}

// BOT HAZIR OLDUĞUNDA
client.once('clientReady', () => {
    console.log(`🔥 ${client.user.tag} sorunsuz başlatıldı! 7/24 Aktif.`);
    setInterval(updateStats, 10 * 60 * 1000);
});

// ==========================================
// 👤 OTOMATİK ROL VERME (GUILD MEMBER ADD)
// ==========================================
client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;

    try {
        const autoRoleId = await db.get(`autorole_${member.guild.id}`);
        if (!autoRoleId) return;

        const role = member.guild.roles.cache.get(autoRoleId);
        if (role) {
            await member.roles.add(role).catch(err => {
                console.log(`[Otorol Hatası] ${member.user.tag} için rol verilemedi: ${err.message}`);
            });
        }
    } catch (err) {
        console.error('Otorol hatası:', err);
    }
});

// ==========================================
// 🏷️ SUNUCU ETİKETİ DEĞİŞİMİNİ CANLI TAKİP ETME (GUILD MEMBER UPDATE)
// ==========================================
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (newMember.user.bot) return;

    try {
        await syncTagRole(newMember);
    } catch (err) {
        console.error('Etiket rol senkronizasyon hatası:', err);
    }
});

// ==========================================
// 🏷️ SUNUCU ETİKETİ DEĞİŞİMİNİ CANLI TAKİP ETME (USER UPDATE)
// ==========================================
// NOT: Discord "Sunucu Etiketi" (primary guild) alanı bazı durumlarda guildMemberUpdate yerine
// sadece userUpdate event'i ile bildirilir (kütüphane/gateway davranışına göre değişebiliyor).
// Bu yüzden her iki event'i de dinleyip garantiye alıyoruz; tag anında değişince rol de anında güncellenir.
client.on('userUpdate', async (oldUser, newUser) => {
    if (newUser.bot) return;

    try {
        for (const guild of client.guilds.cache.values()) {
            let member = guild.members.cache.get(newUser.id);
            if (!member) {
                member = await guild.members.fetch(newUser.id).catch(() => null);
            }
            if (member) {
                await syncTagRole(member);
            }
        }
    } catch (err) {
        console.error('Kullanıcı güncelleme (etiket) senkronizasyon hatası:', err);
    }
});

// İSTATİSTİK GÜNCELLEME FONKSİYONU
async function updateStats() {
    for (const guild of client.guilds.cache.values()) {
        try {
            const totalChannelId = await db.get(`stats_total_${guild.id}`);
            const onlineChannelId = await db.get(`stats_online_${guild.id}`);
            const boostChannelId = await db.get(`stats_boost_${guild.id}`);

            if (!totalChannelId) continue;

            await guild.members.fetch().catch(() => {});
            
            const totalMembers = guild.memberCount;
            const onlineMembers = guild.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
            const boostCount = guild.premiumSubscriptionCount || 0;

            const totalChan = guild.channels.cache.get(totalChannelId);
            const onlineChan = guild.channels.cache.get(onlineChannelId);
            const boostChan = guild.channels.cache.get(boostChannelId);

            if (totalChan && totalChan.name !== `👥 Toplam Üye: ${totalMembers}`) {
                await totalChan.setName(`👥 Toplam Üye: ${totalMembers}`).catch(() => {});
            }
            if (onlineChan && onlineChan.name !== `🟢 Çevrim içi: ${onlineMembers}`) {
                await onlineChan.setName(`🟢 Çevrim içi: ${onlineMembers}`).catch(() => {});
            }
            if (boostChan && boostChan.name !== `🚀 Takviye Sayısı: ${boostCount}`) {
                await boostChan.setName(`🚀 Takviye Sayısı: ${boostCount}`).catch(() => {});
            }
        } catch (err) {
            console.log(`İstatistik güncelleme hatası (${guild.name}):`, err);
        }
    }
}

// ==========================================
// 🎙️ ÖZEL ODA SİSTEMİ (VOICE STATE UPDATE)
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;
    const member = newState.member;
    if (!guild || !member || member.user.bot) return;

    // ==========================================
    // ⏱️ SES SÜRESİ TAKİBİ (!sestop için)
    // ==========================================
    if (oldState.channelId !== newState.channelId) {
        // Bir kanaldan ayrıldıysa (veya kanal değiştirdiyse) geçen süreyi topla
        if (oldState.channelId) {
            const joinTime = await db.get(`voicejoin_${guild.id}_${member.id}`);
            if (joinTime) {
                const elapsed = Date.now() - joinTime;
                if (elapsed > 0) {
                    const total = Number(await db.get(`voicetime_${guild.id}_${member.id}`)) || 0;
                    await db.set(`voicetime_${guild.id}_${member.id}`, total + elapsed);
                }
            }
            await db.delete(`voicejoin_${guild.id}_${member.id}`);
        }
        // Yeni bir kanala girdiyse sayacı başlat
        if (newState.channelId) {
            await db.set(`voicejoin_${guild.id}_${member.id}`, Date.now());
        }
    }

    const createChannelId = await db.get(`j2c_channel_${guild.id}`);

    // --- 1. Kullanıcı "Özel Oda Oluştur" kanalına girerse ---
    if (newState.channelId && newState.channelId === createChannelId) {
        const isCreating = await db.get(`creating_${member.id}`);
        if (isCreating) return;
        await db.set(`creating_${member.id}`, true);

        try {
            let category = guild.channels.cache.find(c => c.name === 'Özel Odalar' && c.type === ChannelType.GuildCategory);
            if (!category) {
                category = await guild.channels.create({
                    name: 'Özel Odalar',
                    type: ChannelType.GuildCategory
                }).catch(() => null);
            }

            const userChannel = await guild.channels.create({
                name: `🔊 ${member.displayName} Odası`,
                type: ChannelType.GuildVoice,
                parent: category ? category.id : null,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]
                    }
                ]
            });

            await db.set(`custom_voice_${userChannel.id}`, { owner: member.id, guild: guild.id });
            await newState.setChannel(userChannel).catch(() => {});

            const panelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('vc_limit').setLabel('Kişi Limiti').setStyle(ButtonStyle.Primary).setEmoji('👥'),
                new ButtonBuilder().setCustomId('vc_lock').setLabel('Kilitle / Aç').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('vc_rename').setLabel('İsim Değiştir').setStyle(ButtonStyle.Success).setEmoji('✏️')
            );

            const panelEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎛️ Özel Oda Yönetim Paneli`)
                .setDescription(`Merhaba ${member}, kanalın başarıyla oluşturuldu!\nAşağıdaki butonları kullanarak odanı özelleştirebilirsin.`)
                .setFooter({ text: 'Sadece oda sahibi bu butonları kullanabilir.' });

            await userChannel.send({ content: `${member}`, embeds: [panelEmbed], components: [panelRow] }).catch(() => {});
        } catch (err) {
            console.log('Özel oda oluşturma hatası:', err);
        } finally {
            await db.delete(`creating_${member.id}`);
        }
    }

    // --- 2. Kullanıcı odadan çıktığında boş odaları silme ---
    if (oldState.channelId) {
        const voiceData = await db.get(`custom_voice_${oldState.channelId}`);
        if (voiceData) {
            const voiceChan = guild.channels.cache.get(oldState.channelId);
            if (voiceChan && voiceChan.members.size === 0) {
                await db.delete(`custom_voice_${oldState.channelId}`);
                await voiceChan.delete().catch(() => {});
            }
        }
    }
});

// ==========================================
// 🎛️ ETKİLEŞİMLER (BUTONLAR, MODALLAR, TICKET)
// ==========================================
client.on('interactionCreate', async (interaction) => {
    // --- MODAL SUBMIT (FORMLAR) ---
    if (interaction.isModalSubmit()) {
        const channel = interaction.channel;
        if (!channel) return;

        const voiceData = await db.get(`custom_voice_${channel.id}`);

        if (!voiceData || voiceData.owner !== interaction.user.id) {
            return interaction.reply({ content: '❌ Bu ayarı yapmak için oda sahibi olmalısınız!', ephemeral: true });
        }

        if (interaction.customId === 'modal_vc_limit') {
            const limitVal = parseInt(interaction.fields.getTextInputValue('input_vc_limit'));
            if (isNaN(limitVal) || limitVal < 0 || limitVal > 99) {
                return interaction.reply({ content: '⚠️ Lütfen 0 ile 99 arasında geçerli bir sayı girin (0 = Sınırsız).', ephemeral: true });
            }
            await channel.setUserLimit(limitVal).catch(() => {});
            return interaction.reply({ content: `✅ Oda kişi sayısı **${limitVal === 0 ? 'Sınırsız' : limitVal}** olarak ayarlandı!`, ephemeral: true });
        }

        if (interaction.customId === 'modal_vc_rename') {
            const newName = interaction.fields.getTextInputValue('input_vc_rename');
            await interaction.deferReply({ ephemeral: true });
            try {
                await channel.setName(`🔊 ${newName}`);
                return interaction.editReply({ content: `✅ Kanal ismi **"${newName}"** olarak değiştirildi!` });
            } catch (err) {
                return interaction.editReply({ content: `⚠️ Discord sınırlarından dolayı ismi bu kadar hızlı değiştiremezsiniz. Lütfen biraz bekleyin.` });
            }
        }
    }

    if (!interaction.isButton()) return;

    const guild = interaction.guild;
    const user = interaction.user;

    // --- ÖZEL ODA BUTON KONTROLLERİ ---
    if (['vc_limit', 'vc_lock', 'vc_rename'].includes(interaction.customId)) {
        const channel = interaction.channel;
        const voiceData = await db.get(`custom_voice_${channel?.id}`);

        if (!voiceData) {
            return interaction.reply({ content: '❌ Bu işlem yalnızca özel ses odalarında kullanılabilir.', ephemeral: true });
        }

        if (voiceData.owner !== user.id) {
            return interaction.reply({ content: '⛔ Bu odayı yönetme yetkiniz yok! Sadece oda sahibi değiştirebilir.', ephemeral: true });
        }

        if (interaction.customId === 'vc_limit') {
            const modal = new ModalBuilder()
                .setCustomId('modal_vc_limit')
                .setTitle('Kişi Limiti Ayarla');

            const limitInput = new TextInputBuilder()
                .setCustomId('input_vc_limit')
                .setLabel('Kişi Sayısı (0 = Sınırsız)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: 5')
                .setMaxLength(2)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'vc_rename') {
            const modal = new ModalBuilder()
                .setCustomId('modal_vc_rename')
                .setTitle('Oda İsim Değiştir');

            const nameInput = new TextInputBuilder()
                .setCustomId('input_vc_rename')
                .setLabel('Yeni Oda İsmi')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: Sohbet Odası')
                .setMaxLength(30)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'vc_lock') {
            const currentOverwrite = channel.permissionOverwrites.cache.get(guild.id);
            const isLocked = currentOverwrite?.deny.has(PermissionFlagsBits.Connect);

            if (isLocked) {
                await channel.permissionOverwrites.edit(guild.id, { Connect: true }).catch(() => {});
                return interaction.reply({ content: '🔓 Oda başarıyla **herkese açıldı**.', ephemeral: true });
            } else {
                await channel.permissionOverwrites.edit(guild.id, { Connect: false }).catch(() => {});
                return interaction.reply({ content: '🔒 Oda **kilitlendi**! Artık sizin izniniz olmadan kimse giremez.', ephemeral: true });
            }
        }
    }

    // --- TICKET BUTONLARI ---
    if (interaction.customId === 'create_ticket') {
        const existingChannel = guild.channels.cache.find(c => c.name === `ticket-${user.username.toLowerCase()}`);
        if (existingChannel) {
            return interaction.reply({ content: `⚠️ Zaten açık bir destek talebiniz bulunuyor: ${existingChannel}`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        let category = guild.channels.cache.find(c => c.name === 'Talepler' && c.type === ChannelType.GuildCategory);
        if (!category) {
            category = await guild.channels.create({
                name: 'Talepler',
                type: ChannelType.GuildCategory
            }).catch(() => null);
        }

        const staffRole = guild.roles.cache.find(r => r.name === '.');

        const permissionOverwrites = [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
        ];

        if (staffRole) {
            permissionOverwrites.push({ id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] });
        }

        const ticketChannel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: permissionOverwrites
        }).catch(() => null);

        if (!ticketChannel) {
            return interaction.editReply({ content: '❌ Kanal oluşturulurken bir hata oluştu. Yetkileri kontrol edin.' });
        }

        const closeBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Talebi Kapat').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        const ticketEmbed = new EmbedBuilder()
            .setColor('#2F3136')
            .setTitle(`📩 Destek Talebi - ${user.username}`)
            .setDescription(`Merhaba ${user}, yetkili ekibimiz en kısa sürede seninle ilgilenecektir.\nSorununu veya talebini detaylıca açıklayabilirsin.`)
            .setFooter({ text: 'Talebi sonlandırmak için aşağıdaki butona tıklayabilirsiniz.' });

        const mentionText = staffRole ? `${user} | ${staffRole}` : `${user}`;
        await ticketChannel.send({ content: mentionText, embeds: [ticketEmbed], components: [closeBtn] });

        return interaction.editReply({ content: `✅ Destek talebiniz oluşturuldu: ${ticketChannel}` });
    }

    if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: '🔒 Destek talebi 5 saniye içinde kapatılıyor...' });
        setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
    }
});

// MESAJ DİNLENMESİ
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    const channelName = message.channel.name.toLowerCase()
        .replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i')
        .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ğ/g, 'g');

    // ==========================================
    // 🔤 KELİME TÜRETMECE OYUNU
    // ==========================================
    if (channelName.includes('kelime-turetmece') || channelName.includes('kelime-oyunu') || channelName.includes('turetmece')) {
        const text = message.content.trim().toLowerCase();

        if (text.split(/\s+/).length > 1) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ ${message.author}, lütfen sadece **tek bir kelime** yaz!`).catch(() => {});
            setTimeout(() => warn.delete().catch(() => {}), 3000);
            return;
        }

        if (text.length < 2) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ ${message.author}, tek harf yazamazsın! **En az 2 harfli** geçerli bir kelime girmelisin.`).catch(() => {});
            setTimeout(() => warn.delete().catch(() => {}), 3000);
            return;
        }

        const lastWord = await db.get(`lastWord_${guildId}`);
        const lastUser = await db.get(`lastUser_kelime_${guildId}`);

        if (lastUser === userId) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ ${message.author}, üst üste iki kere kelime yazamazsın!`).catch(() => {});
            setTimeout(() => warn.delete().catch(() => {}), 3000);
            return;
        }

        if (lastWord) {
            const lastChar = lastWord.slice(-1);
            const firstChar = text.charAt(0);

            if (firstChar !== lastChar) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`❌ Kelimeniz **"${lastChar.toUpperCase()}"** harfi ile başlamalıdır! (Son kelime: **${lastWord}**)`).catch(() => {});
                setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }
        }

        await db.set(`lastWord_${guildId}`, text);
        await db.set(`lastUser_kelime_${guildId}`, userId);
        await message.react('✅').catch(() => {});
        return;
    }

    // ==========================================
    // 💣 BOM OYUNU
    // ==========================================
    if (channelName.includes('bom-oyunu') || channelName.includes('bom')) {
        const text = message.content.trim().toLowerCase();
        let count = Number(await db.get(`bomCount_${guildId}`)) || 1;
        const lastUser = await db.get(`lastUser_bom_${guildId}`);

        if (lastUser === userId) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ ${message.author}, üst üste sayı/BOM yazamazsın!`).catch(() => {});
            setTimeout(() => warn.delete().catch(() => {}), 3000);
            return;
        }

        const isBomTurn = count % 5 === 0;
        let isValid = false;

        if (isBomTurn) {
            if (text === 'bom') isValid = true;
        } else {
            if (text === count.toString()) isValid = true;
        }

        if (isValid) {
            await db.set(`bomCount_${guildId}`, count + 1);
            await db.set(`lastUser_bom_${guildId}`, userId);
            await message.react('💥').catch(() => {});
        } else {
            await db.set(`bomCount_${guildId}`, 1);
            await db.delete(`lastUser_bom_${guildId}`);
            
            const expected = isBomTurn ? '**BOM**' : `**${count}**`;
            await message.channel.send(`💥 **BOOOM!** ${message.author} yanlış yazdı! Beklenen: ${expected}.\nOyun sıfırlandı, **1**'den başlıyoruz!`).catch(() => {});
        }
        return;
    }

    // --- 🛡️ GÜVENLİK VE FİLTRE SİSTEMİ ---
    const isStaff = message.member?.permissions.has(PermissionFlagsBits.ManageMessages);
    const hasBypassRole = message.member?.roles.cache.some(r => filterBypassRoles.includes(r.name));

    if (!isStaff) {
        const msgContent = message.content;

        // 🚫 DAVET LİNKİ KONTROLÜ - Bypass rolü olsa bile HERKES için geçerli
        const hasInvite = inviteRegex.test(msgContent);
        if (hasInvite) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(`⚠️ ${message.author}, bu sunucuda **başka sunucu davet linki paylaşmak yasaktır!**`).catch(() => {});
            if (warn) setTimeout(() => warn.delete().catch(() => {}), 4000);
            return;
        }

        if (!hasBypassRole) {
            // Mesajdaki link bir GIF linki mi? (Discord GIF picker, Tenor, Giphy, .gif uzantılı linkler)
            const isGifLink = gifRegex.test(msgContent);

            const hasLink = linkRegex.test(msgContent) && !isGifLink;
            const hasBadWord = badWordsRegex.test(msgContent);

            if (hasLink) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, bu sunucuda **link/reklam paylaşmak yasaktır!**`).catch(() => {});
                if (warn) setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }

            if (hasBadWord) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, lütfen **üslubuna dikkat et!** Küfürlü mesajlar otomatik silinir.`).catch(() => {});
                if (warn) setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }
        } else {
            // Bypass rolüne sahip üyeler için de küfür filtresi çalışmaya devam eder
            const hasBadWord = badWordsRegex.test(msgContent);
            if (hasBadWord) {
                await message.delete().catch(() => {});
                const warn = await message.channel.send(`⚠️ ${message.author}, lütfen **üslubuna dikkat et!** Küfürlü mesajlar otomatik silinir.`).catch(() => {});
                if (warn) setTimeout(() => warn.delete().catch(() => {}), 4000);
                return;
            }
        }
    }

    // --- MESAJ SAYACI (!mesajtop için) ---
    const currentMsgCount = Number(await db.get(`msgcount_${guildId}_${userId}`)) || 0;
    await db.set(`msgcount_${guildId}_${userId}`, currentMsgCount + 1);

    // --- KOMUTLAR ---

    // 🤖 !otorol-ayarla @Rol
    if (message.content.startsWith('!otorol-ayarla')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Bu komutu sadece **Yöneticiler** kullanabilir!");
        }

        const role = message.mentions.roles.first();
        if (!role) {
            return message.reply("⚠️ Lütfen bir rol etiketleyin! Örn: `!otorol-ayarla @Üye`");
        }

        await db.set(`autorole_${guildId}`, role.id);
        return message.reply(`✅ Otorol başarıyla **${role.name}** olarak ayarlandı!`);
    }

    // 🏷️ !tagrol-ayarla @Rol (Sunucu Etiketi / Server Tag rolü)
    if (message.content.startsWith('!tagrol-ayarla')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Bu komutu sadece **Yöneticiler** kullanabilir!");
        }

        const role = message.mentions.roles.first();
        if (!role) {
            return message.reply("⚠️ Lütfen bir rol etiketleyin! Örn: `!tagrol-ayarla @Sunucu Tagcıları`");
        }

        await db.set(`tagrole_${guildId}`, role.id);

        const setupMsg = await message.reply(`✅ Sunucu etiketi (tag) rolü **${role.name}** olarak ayarlandı!\n🔄 Mevcut üyeler taranıyor, lütfen bekleyin...`);

        try {
            await message.guild.members.fetch();
        } catch (err) {
            console.log('Üye listesi çekilirken hata:', err);
        }

        let added = 0;
        let removed = 0;
        let checked = 0;

        for (const member of message.guild.members.cache.values()) {
            if (member.user.bot) continue;
            checked++;

            const hasTag = hasServerTag(member);
            const hasRole = member.roles.cache.has(role.id);

            try {
                if (hasTag && !hasRole) {
                    await member.roles.add(role);
                    added++;
                } else if (!hasTag && hasRole) {
                    await member.roles.remove(role);
                    removed++;
                }
            } catch (err) {
                console.log(`[Etiket Tarama Hatası] ${member.user.tag}: ${err.message}`);
            }
        }

        return setupMsg.edit(`✅ Tarama tamamlandı! **${checked}** üye kontrol edildi.\n🎖️ **${added}** üyeye rol verildi.\n📉 **${removed}** üyeden rol alındı (artık etiketi yok).`);
    }

    // 🔨 !ban @user [sebep]
    if (message.content.startsWith('!ban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Bu komutu kullanmak için `Üyeleri Yasakla` yetkin olması lazım!").catch(() => {});
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply("⚠️ Doğru Kullanım: `!ban @kullanıcı [sebep]`").catch(() => {});
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && !targetMember.bannable) {
            return message.reply("⛔ Bu kullanıcıyı yasaklayamam! (Rolüm yeterince yüksek değil veya kullanıcı yetkili)").catch(() => {});
        }

        const args = message.content.split(' ').slice(2);
        const reason = args.join(' ') || 'Sebep belirtilmedi';

        try {
            await message.guild.members.ban(targetUser.id, { reason: `${message.author.tag}: ${reason}` });
            return message.channel.send(`🔨 ${targetUser.tag} sunucudan **yasaklandı**!\n📝 Sebep: ${reason}`).catch(() => {});
        } catch (err) {
            console.log('Ban hatası:', err);
            return message.reply("❌ Yasaklama işlemi başarısız oldu.").catch(() => {});
        }
    }

    // 🚫 !ipban @user [sebep]
    if (message.content.startsWith('!ipban')) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Bu komutu kullanmak için `Üyeleri Yasakla` yetkin olması lazım!").catch(() => {});
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply("⚠️ Doğru Kullanım: `!ipban @kullanıcı [sebep]`").catch(() => {});
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && !targetMember.bannable) {
            return message.reply("⛔ Bu kullanıcıyı yasaklayamam! (Rolüm yeterince yüksek değil veya kullanıcı yetkili)").catch(() => {});
        }

        const args = message.content.split(' ').slice(2);
        const reason = args.join(' ') || 'Sebep belirtilmedi';

        try {
            // NOT: Discord bot API'si botlara gerçek IP adresi bilgisi vermez, bu yüzden
            // teknik olarak "IP bazlı" bir yasaklama yapılamaz. Bu komut normal bir sunucu
            // yasağı uygular ve ek olarak kullanıcının son 7 günlük mesajlarını temizler.
            await message.guild.members.ban(targetUser.id, {
                reason: `${message.author.tag} (IP Ban): ${reason}`,
                deleteMessageSeconds: 7 * 24 * 60 * 60
            });
            return message.channel.send(`🚫 ${targetUser.tag} **IP Ban** ile yasaklandı! (Son 7 günlük mesajları temizlendi)\n📝 Sebep: ${reason}`).catch(() => {});
        } catch (err) {
            console.log('IP Ban hatası:', err);
            return message.reply("❌ Yasaklama işlemi başarısız oldu.").catch(() => {});
        }
    }

    // 🔇 !mute @user 10dk [sebep]
    if (message.content.startsWith('!mute')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply("❌ Bu komutu kullanmak için `Üyeleri Zaman Aşımına Uğrat` yetkin olması lazım!").catch(() => {});
        }

        const args = message.content.split(' ');
        const targetUser = message.mentions.users.first();
        const durationArg = args[2];
        const reason = args.slice(3).join(' ') || 'Sebep belirtilmedi';

        if (!targetUser || !durationArg) {
            return message.reply("⚠️ Doğru Kullanım: `!mute @kullanıcı 10dk [sebep]`\nGeçerli birimler: `sn` (saniye), `dk` (dakika), `sa` (saat), `gün`").catch(() => {});
        }

        const durationMs = parseDuration(durationArg);
        if (!durationMs) {
            return message.reply("⚠️ Süre formatı geçersiz! Örn: `10dk`, `1sa`, `30sn`, `1gün`").catch(() => {});
        }

        const maxDuration = 28 * 24 * 60 * 60 * 1000; // Discord limiti: 28 gün
        if (durationMs > maxDuration) {
            return message.reply("⚠️ Discord susturma süresi en fazla **28 gün** olabilir!").catch(() => {});
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return message.reply("⚠️ Bu kullanıcı sunucuda bulunamadı!").catch(() => {});
        }

        if (!targetMember.moderatable) {
            return message.reply("⛔ Bu kullanıcıyı susturamam! (Rolüm yeterince yüksek değil veya kullanıcı yetkili)").catch(() => {});
        }

        try {
            await targetMember.timeout(durationMs, `${message.author.tag}: ${reason}`);
            return message.channel.send(`🔇 ${targetUser} **${durationArg}** boyunca susturuldu!\n📝 Sebep: ${reason}`).catch(() => {});
        } catch (err) {
            console.log('Mute hatası:', err);
            return message.reply("❌ Susturma işlemi başarısız oldu.").catch(() => {});
        }
    }

    // 🔒 !kilit [@Rol1 @Rol2 ...]
    if (message.content === '!kilit' || message.content.startsWith('!kilit ')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Bu komutu kullanmak için `Kanalları Yönet` yetkin olması lazım!").catch(() => {});
        }

        const channel = message.channel;
        const extraRoles = message.mentions.roles;

        try {
            // @everyone rolünün bu kanalda mesaj atma iznini kapat
            await channel.permissionOverwrites.edit(message.guild.id, {
                SendMessages: false
            });

            // Yöneticileri ve "Mesajları Yönet" yetkisine sahip rolleri kanalda serbest bırak
            const staffRoles = message.guild.roles.cache.filter(r =>
                r.permissions.has(PermissionFlagsBits.Administrator) ||
                r.permissions.has(PermissionFlagsBits.ManageMessages)
            );

            const rolesToAllow = new Map();
            staffRoles.forEach(r => rolesToAllow.set(r.id, r));
            extraRoles.forEach(r => rolesToAllow.set(r.id, r));

            for (const role of rolesToAllow.values()) {
                await channel.permissionOverwrites.edit(role.id, {
                    SendMessages: true
                }).catch(() => {});
            }

            const extraNote = extraRoles.size > 0
                ? `\n✅ Ek olarak izinli roller: ${extraRoles.map(r => r.toString()).join(', ')}`
                : '';

            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setDescription(`🔒 Bu kanal **${message.author}** tarafından kilitlendi. Artık sadece yetkililer mesaj atabilir.${extraNote}`);

            return channel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            console.log('Kilit hatası:', err);
            return message.reply("❌ Kanal kilitlenirken bir hata oluştu. Bot yetkilerini kontrol et!").catch(() => {});
        }
    }

    // 🔓 !kilitac
    if (message.content === '!kilitac') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply("❌ Bu komutu kullanmak için `Kanalları Yönet` yetkin olması lazım!").catch(() => {});
        }

        const channel = message.channel;

        try {
            // @everyone rolünün mesaj atma izin durumunu sıfırla (nötr hale getir)
            await channel.permissionOverwrites.edit(message.guild.id, {
                SendMessages: null
            });

            const embed = new EmbedBuilder()
                .setColor('#57F287')
                .setDescription(`🔓 Bu kanalın kilidi **${message.author}** tarafından açıldı. Herkes tekrar mesaj atabilir.`);

            return channel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            console.log('Kilit açma hatası:', err);
            return message.reply("❌ Kanal kilidi açılırken bir hata oluştu. Bot yetkilerini kontrol et!").catch(() => {});
        }
    }

    // 🎙️ !ozel-oda-kur
    if (message.content === '!ozel-oda-kur') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Bu komutu sadece **Yöneticiler** kullanabilir!");
        }

        let category = message.guild.channels.cache.find(c => c.name === 'Özel Oda Sistemi' && c.type === ChannelType.GuildCategory);
        if (!category) {
            category = await message.guild.channels.create({
                name: 'Özel Oda Sistemi',
                type: ChannelType.GuildCategory
            }).catch(() => null);
        }

        const createChan = await message.guild.channels.create({
            name: '➕ Özel Oda Oluştur',
            type: ChannelType.GuildVoice,
            parent: category ? category.id : null
        }).catch(() => null);

        if (createChan) {
            await db.set(`j2c_channel_${guildId}`, createChan.id);
            return message.reply("✅ Özel Oda Oluşturma kanalı başarıyla kuruldu!");
        } else {
            return message.reply("❌ Kanal oluşturulurken bir hata oluştu.");
        }
    }

    // 📊 !istatistik-kur
    if (message.content === '!istatistik-kur') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Bu komutu sadece **Yöneticiler** kullanabilir!");
        }

        const msg = await message.reply("⚙️ İstatistik kanalları oluşturuluyor...");

        await message.guild.members.fetch().catch(() => {});
        const totalMembers = message.guild.memberCount;
        const onlineMembers = message.guild.members.cache.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
        const boostCount = message.guild.premiumSubscriptionCount || 0;

        const category = await message.guild.channels.create({
            name: '📊 SUNUCU İSTATİSTİKLERİ',
            type: ChannelType.GuildCategory,
            position: 0
        }).catch(() => null);

        const channelPermissions = [{ id: message.guild.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] }];

        const totalChan = await message.guild.channels.create({ name: `👥 Toplam Üye: ${totalMembers}`, type: ChannelType.GuildVoice, parent: category ? category.id : null, permissionOverwrites: channelPermissions }).catch(() => null);
        const onlineChan = await message.guild.channels.create({ name: `🟢 Çevrim içi: ${onlineMembers}`, type: ChannelType.GuildVoice, parent: category ? category.id : null, permissionOverwrites: channelPermissions }).catch(() => null);
        const boostChan = await message.guild.channels.create({ name: `🚀 Takviye Sayısı: ${boostCount}`, type: ChannelType.GuildVoice, parent: category ? category.id : null, permissionOverwrites: channelPermissions }).catch(() => null);

        if (totalChan && onlineChan && boostChan) {
            await db.set(`stats_total_${guildId}`, totalChan.id);
            await db.set(`stats_online_${guildId}`, onlineChan.id);
            await db.set(`stats_boost_${guildId}`, boostChan.id);
            return msg.edit("✅ İstatistik kanalları başarıyla oluşturuldu!");
        } else {
            return msg.edit("❌ İstatistik kanalları oluşturulurken yetki hatası alındı.");
        }
    }

    // 📩 !destek-kur
    if (message.content === '!destek-kur') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Bu komutu sadece **Yöneticiler** kullanabilir!");
        }

        const ticketEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📩 Destek Sistemi')
            .setDescription('Yetkili ekibimizle görüşmek için aşağıdaki **"Destek Oluştur"** butonuna basabilirsiniz.')
            .setFooter({ text: `${message.guild.name} Destek Sistemi`, iconURL: message.guild.iconURL() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_ticket').setLabel('Destek Oluştur').setStyle(ButtonStyle.Primary).setEmoji('📩')
        );

        await message.channel.send({ embeds: [ticketEmbed], components: [row] });
        await message.delete().catch(() => {});
        return;
    }

    // 📘 !yardım
    if (message.content === '!yardım' || message.content === '!help') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`📚 ${message.guild.name} - Bot Komut Rehberi`)
            .setDescription('Aşağıda sunucuda kullanabileceğin tüm komutlar listelenmiştir:')
            .addFields(
                { name: '👤 Kullanıcı Komutları', value: '`!mesajtop` — En çok mesaj atan ilk 10 üyeyi sıralar.\n`!sestop` — Seste en çok vakit geçiren ilk 10 üyeyi sıralar.\n`!yardım` — Bu menüyü açar.' },
                { name: '🎮 Mini Oyun Kanalları', value: '• **#kelime-turetmece:** Kelimenin son harfiyle yeni kelime türetin.\n• **#bom-oyunu:** 1, 2, 3, 4, BOM, 6... şeklinde sayın!' },
                { name: '🛠️ Yönetici Komutları', value: '`!otorol-ayarla @Rol` — Sunucuya katılanlara verilecek rolü ayarlar.\n`!tagrol-ayarla @Rol` — Sunucu Etiketi (server tag) takan üyelere verilecek rolü ayarlar ve mevcut üyeleri tarar.\n`!ozel-oda-kur` — Özel oda oluşturma kanalını kurar.\n`!istatistik-kur` — İstatistik kanallarını oluşturur.\n`!destek-kur` — Destek panelini kurar.\n`!sil [sayı]` — Belirtilen miktarda mesajı siler.' },
                { name: '🔨 Moderasyon Komutları', value: '`!ban @üye [sebep]` — Üyeyi sunucudan yasaklar.\n`!ipban @üye [sebep]` — Üyeyi yasaklar ve son 7 günlük mesajlarını temizler.\n`!mute @üye 10dk [sebep]` — Üyeyi belirtilen süre boyunca susturur (sn/dk/sa/gün).\n`!kilit [@Rol]` — Kanalı kilitler, sadece yetkililer (ve varsa etiketlenen rol) mesaj atabilir.\n`!kilitac` — Kanalın kilidini açar.' },
                { name: '🛡️ Otomatik Güvenlik', value: '• **Küfür Engeli:** Otomatik silinir.\n• **Reklam Engeli:** Linkler engellenir (GIF linkleri hariç, ayrıca 100. Seviye ve gifyetki rolleri linklerde muaftır — davet linkleri herkes için yasaktır).' }
            )
            .setFooter({ text: 'Keyifli sohbetler dileriz!', iconURL: client.user.displayAvatarURL() });

        return message.channel.send({ embeds: [helpEmbed] }).catch(() => {});
    }

    // 💬 !mesajtop
    if (message.content === '!mesajtop') {
        const allData = await db.all().catch(() => []);
        const guildMsgs = allData.filter(data => data.id && data.id.startsWith(`msgcount_${guildId}_`));

        guildMsgs.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

        const top10 = guildMsgs.slice(0, 10);
        let description = "";

        for (let i = 0; i < top10.length; i++) {
            const memberId = top10[i].id.split('_')[2];
            const msgCount = top10[i].value;
            description += `**${i + 1}.** <@${memberId}> — **${msgCount} mesaj**\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle(`💬 ${message.guild.name} Mesaj Liderlik Tablosu`)
            .setDescription(description || "Henüz mesaj atan kimse yok!");

        return message.channel.send({ embeds: [embed] }).catch(() => {});
    }

    // 🎙️ !sestop
    if (message.content === '!sestop') {
        const allData = await db.all().catch(() => []);
        const totals = {};

        // Kanaldan çıkmış olup biriken (kaydedilmiş) süreler
        allData
            .filter(data => data.id && data.id.startsWith(`voicetime_${guildId}_`))
            .forEach(data => {
                const memberId = data.id.split('_')[2];
                totals[memberId] = (totals[memberId] || 0) + (Number(data.value) || 0);
            });

        // Şu an seste olup süresi hâlâ devam edenler
        allData
            .filter(data => data.id && data.id.startsWith(`voicejoin_${guildId}_`))
            .forEach(data => {
                const memberId = data.id.split('_')[2];
                const elapsed = Date.now() - Number(data.value);
                if (elapsed > 0) {
                    totals[memberId] = (totals[memberId] || 0) + elapsed;
                }
            });

        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
        let description = "";

        for (let i = 0; i < sorted.length; i++) {
            const [memberId, ms] = sorted[i];
            const hours = Math.floor(ms / 3600000);
            const minutes = Math.floor((ms % 3600000) / 60000);
            description += `**${i + 1}.** <@${memberId}> — **${hours} saat ${minutes} dk**\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#EB459E')
            .setTitle(`🎙️ ${message.guild.name} Ses Süresi Liderlik Tablosu`)
            .setDescription(description || "Henüz seste vakit geçiren kimse yok!");

        return message.channel.send({ embeds: [embed] }).catch(() => {});
    }

    // 🧹 !sil
    if (message.content.startsWith('!sil')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Bu komutu kullanmak için `Mesajları Yönet` yetkin olması lazım!").catch(() => {});
        }

        const args = message.content.split(' ');
        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply("⚠️ Lütfen 1 ile 100 arasında bir sayı girin!").catch(() => {});
        }

        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            const replyMsg = await message.channel.send(`✅ **${deleted.size}** mesaj silindi.`);
            setTimeout(() => replyMsg.delete().catch(() => {}), 3000);
        } catch (err) {
            message.channel.send("⚠️ 14 günden eski mesajlar tek seferde toplu silinemez!").catch(() => {});
        }
    }

    // 🔄 !kelimesifirla
    if (message.content === '!kelimesifirla') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("❌ Bu komutu kullanmak için `Mesajları Yönet` yetkin olması lazım!").catch(() => {});
        }

        await db.delete(`lastWord_${guildId}`);
        await db.delete(`lastUser_kelime_${guildId}`);

        return message.channel.send("🔄 Kelime türetmece oyunu başarıyla **sıfırlandı**! Artık istediğiniz kelimeyle yeniden başlayabilirsiniz.").catch(() => {});
    }
});

// DISCORD BOT TOKENİ (.env DOSYASINDAN ÇEKİLİR)
client.login(process.env.TOKEN).catch(err => {
    console.error("⚠️ Bot giriş yapamadı! Lütfen environment variables (TOKEN) kısmını kontrol edin.", err);
});