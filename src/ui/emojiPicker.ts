interface EmojiCategory {
    name: string;
    items: string[];
}

const KEYWORDS: Record<string, string> = {
    "🏠": "房子 家 住宅 house home",
    "🏡": "房子 家 院子 house",
    "🎯": "目标 靶心 target goal",
    "📚": "书 学习 阅读 book study",
    "💼": "工作 公文包 work job",
    "❤️": "爱 心 喜欢 heart love",
    "💔": "心碎 难过 broken heart",
    "😀": "笑 开心 高兴 smile happy",
    "😊": "笑 微笑 smile",
    "😂": "笑 笑哭 laugh",
    "🥰": "爱 喜欢 love",
    "😭": "哭 难过 cry sad",
    "🔥": "火 热门 fire hot",
    "⭐️": "星 收藏 star",
    "✨": "闪 亮 sparkle",
    "☕️": "咖啡 饮料 coffee",
    "🍰": "蛋糕 甜点 cake",
    "🎉": "庆祝 派对 party",
    "🎁": "礼物 gift",
    "🏆": "奖杯 冠军 trophy",
    "🚗": "车 汽车 car",
    "✈️": "飞机 旅行 plane travel",
    "🚀": "火箭 启动 rocket",
    "🐶": "狗 宠物 dog",
    "🐱": "猫 宠物 cat",
    "🌱": "植物 成长 种子 plant",
    "🌹": "玫瑰 花 rose",
    "📌": "图钉 固定 pin",
    "✅": "完成 对勾 check done",
    "💡": "想法 灯泡 idea",
    "💰": "钱 金钱 money",
    "🎵": "音乐 音符 music",
    "🎨": "画画 艺术 art",
    "📝": "笔记 写作 note",
    "🇨🇳": "中国 国旗 china",
    "🇺🇸": "美国 国旗 usa",
    "🇯🇵": "日本 国旗 japan",
};

export const EMOJI_CATEGORIES: EmojiCategory[] = [
    {
        name: "常用表情",
        items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💟 ✨ ⭐️ 🌟 💫 ⚡️ 🔥 🎉 🎊 🎁 🎂 🏆 🥇 🎯 📌 📎 🔗 ✅ ❌ ❓ ❗️ 💯 👍 👎 👏 🙏 💪 👀".split(" "),
    },
    {
        name: "笑脸和人类",
        items: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👻 💀 👽 🤖 💩 👋 🤚 🖐 ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 👶 👧 👦 👩 👨 🧑 👵 👴 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍⚕️ 👩‍🎓 👨‍🎓 👩‍🏫 👨‍🏫 👩‍💻 👨‍💻 👩‍🍳 👨‍🍳 👩‍🎤 👨‍🎤 👩‍🚀 👨‍🚀 👰 🤵 🤰 🤱 👼 🎅 🤶 🧙 🧚 🧛 🧜 🧝 🦸 🦹".split(" "),
    },
    {
        name: "动物和自然",
        items: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦅 🦉 🦄 🐝 🦋 🐌 🐞 🐜 🕷 🦂 🐢 🐍 🦎 🦖 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦏 🐪 🐫 🦒 🐄 🐎 🐖 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊 🐇 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍃 🍂 🍁 🍄 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌙 🌎 🌍 🌏 💫 ⭐️ 🌈 ☀️ ⛅️ ☁️ 🌧 ⛈ ❄️ ☃️ 💧 🌊".split(" "),
    },
    {
        name: "食物和饮料",
        items: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🍞 🥖 🥨 🥞 🧈 🍳 🧀 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕️ 🍵 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🍾".split(" "),
    },
    {
        name: "活动",
        items: "⚽️ 🏀 🏈 ⚾️ 🥎 🎾 🏐 🏉 🎱 🏓 🏸 🏒 🏑 🥍 🏏 🥊 🥋 🎽 🛹 🛼 🛷 ⛸ 🥌 🎿 ⛷ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖 🎗 🎫 🎟 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 ♟ 🎯 🎳 🎮 🎰 🧩".split(" "),
    },
    {
        name: "旅行和地点",
        items: "🚗 🚕 🚙 🚌 🚎 🏎 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛴 🚲 🛵 🏍 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩 💺 🛰 🚀 🛸 🚁 🛶 ⛵️ 🚤 🛥 🛳 ⛴ 🚢 ⚓️ ⛽️ 🚧 🚦 🚏 🗺 🗿 🗽 🗼 🏰 🏯 🏟 🎡 🎢 🎠 ⛲️ ⛱ 🏖 🏝 🏜 🌋 ⛰ 🏔 🗻 🏕 ⛺️ 🏠 🏡 🏘 🏚 🏗 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛 ⛪️ 🕌 🕍 🛕 🕋 ⛩ 🛤 🛣 🗾 🎑 🏞 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙 🌃 🌌 🌉 🌁".split(" "),
    },
    {
        name: "物品",
        items: "⌚️ 📱 📲 💻 ⌨️ 🖥 🖨 🖱 🖲 🕹 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽 🎞 📞 ☎️ 📟 📠 📺 📻 🎙 🎚 🎛 🧭 ⏱ ⏲ ⏰ 🕰 ⌛️ ⏳ 📡 🔋 🔌 💡 🔦 🕯 🧯 🛢 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒ 🛠 ⛏ 🔩 ⚙️ 🧱 ⛓ 🧲 🔫 💣 🧨 🪓 🔪 🗡 ⚔️ 🛡 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡 🧹 🧺 🧻 🚽 🚰 🚿 🛁 🛀 🧼 🪥 🪒 🧽 🪣 🧴 🛎 🔑 🗝 🚪 🪑 🛋 🛏 🛌 🧸 🪆 🖼 🪞 🪟 🛍 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷 🪧 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒 🗓 📆 📅 🗑 📇 🗃 🗳 🗄 📋 📁 📂 🗂 🗞 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇 📐 📏 🧮 📌 📍 ✂️ 🖊 🖋 ✒️ 🖌 🖍 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓".split(" "),
    },
    {
        name: "符号",
        items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☸️ ✡️ 🔯 ☯️ ⛎ ♈️ ♉️ ♊️ ♋️ ♌️ ♍️ ♎️ ♏️ ♐️ ♑️ ♒️ ♓️ 🆔 ⚛️ ☢️ ☣️ 📴 📳 🈶 🈚️ 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕️ 🛑 ⛔️ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗️ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯️ 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿️ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸ ⏯ ⏹ ⏺ ⏭ ⏮ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ ♾ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫️ ⚪️ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾️ ◽️ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛️ ⬜️ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯 ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄️ 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛".split(" "),
    },
    {
        name: "旗帜",
        items: "🏳️ 🏴 🏴‍☠️ 🏁 🚩 🎌 🇨🇳 🇭🇰 🇲🇴 🇹🇼 🇺🇸 🇬🇧 🇯🇵 🇰🇷 🇫🇷 🇩🇪 🇮🇹 🇪🇸 🇵🇹 🇳🇱 🇧🇪 🇨🇭 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇷🇺 🇺🇦 🇹🇷 🇮🇳 🇧🇷 🇦🇷 🇲🇽 🇨🇦 🇦🇺 🇳🇿 🇸🇬 🇲🇾 🇹🇭 🇻🇳 🇮🇩 🇵🇭".split(" "),
    },
];

export function openEmojiPicker(anchor: HTMLElement, onPick: (emoji: string) => void): () => void {
    let query = "";
    const panel = document.createElement("div");
    panel.className = "stm-emoji-panel";
    panel.innerHTML = `
        <input class="b3-text-field stm-emoji-search" placeholder="搜索表情..." />
        <div class="stm-emoji-scroll"></div>`;
    const search = panel.querySelector<HTMLInputElement>(".stm-emoji-search")!;
    const scroll = panel.querySelector<HTMLElement>(".stm-emoji-scroll")!;

    const matches = (emoji: string, category: string) => {
        if (!query) return true;
        const q = query.toLowerCase();
        const keywords = KEYWORDS[emoji] || "";
        return emoji.includes(q) || keywords.toLowerCase().includes(q) || category.toLowerCase().includes(q);
    };

    const render = () => {
        scroll.innerHTML = "";
        let total = 0;
        for (const category of EMOJI_CATEGORIES) {
            const items = category.items.filter(e => matches(e, category.name));
            if (!items.length) continue;
            total += items.length;
            const title = document.createElement("div");
            title.className = "stm-emoji-category";
            title.textContent = category.name;
            const grid = document.createElement("div");
            grid.className = "stm-emoji-grid";
            for (const emoji of items) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "stm-emoji-cell";
                btn.textContent = emoji;
                btn.title = KEYWORDS[emoji] || category.name;
                btn.addEventListener("click", () => {
                    onPick(emoji);
                    close();
                });
                grid.append(btn);
            }
            scroll.append(title, grid);
        }
        if (!total) {
            const empty = document.createElement("div");
            empty.className = "stm-emoji-empty";
            empty.textContent = "没有匹配的表情";
            scroll.append(empty);
        }
    };

    const place = () => {
        const rect = anchor.getBoundingClientRect();
        const width = 336;
        const height = 360;
        let left = rect.left;
        let top = rect.bottom + 6;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
        panel.style.left = `${Math.max(8, left)}px`;
        panel.style.top = `${top}px`;
    };

    const onDocDown = (ev: MouseEvent) => {
        if (!panel.contains(ev.target as Node) && ev.target !== anchor) close();
    };
    const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") close();
    };
    const close = () => {
        panel.remove();
        document.removeEventListener("mousedown", onDocDown);
        document.removeEventListener("keydown", onKey, true);
    };

    search.addEventListener("input", () => {
        query = search.value.trim();
        render();
    });
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey, true);
    document.body.append(panel);
    place();
    render();
    search.focus();

    return close;
}
