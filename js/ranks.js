/*
 * 军衔制度只需在这里修改：
 * level = 等级，name = 中文名，english = 英文名，image = 徽章图片，requirements = 晋升条件。
 * 新增或删除一项后，页面会自动重新排列，不需要重做军衔总览图。
 */
const rankSystem = {
    shared: [
        { level: 1, name: "新兵", english: "Recruit", image: "../assets/ranks/rank-22.png", requirements: ["入队起始"] },
        { level: 2, name: "列兵", english: "Trooper", image: "../assets/ranks/rank-12.png", requirements: ["30 经验", "2 训练度"] },
        { level: 3, name: "二等兵", english: "Trooper 2nd Class", image: "../assets/ranks/rank-11.png", requirements: ["80 经验", "4 训练度"] },
        { level: 4, name: "一等兵", english: "Trooper 1st Class", image: "../assets/ranks/rank-10.png", requirements: ["140 经验", "6 训练度"] },
        { level: 5, name: "准下士", english: "Lance Corporal", image: "../assets/ranks/rank-16.png", requirements: ["220 经验", "8 训练度"] }
    ],
    command: [
        { level: 6, name: "下士", english: "Corporal", image: "../assets/ranks/rank-17.png", requirements: ["300 经验", "4 指挥点"] },
        { level: 7, name: "中士", english: "Sergeant", image: "../assets/ranks/rank-18.png", requirements: ["400 经验", "10 指挥点"] },
        { level: 8, name: "上士", english: "1st Sergeant", image: "../assets/ranks/rank-19.png", requirements: ["520 经验", "16 指挥点"] },
        { level: 9, name: "军士长", english: "Sergeant Major", image: "../assets/ranks/rank-20.png", requirements: ["640 经验", "20 指挥点"] },
        { level: 10, name: "少尉", english: "2nd Lieutenant", image: "../assets/ranks/rank-15.png", requirements: ["760 经验", "24 指挥点"] },
        { level: 11, name: "中尉", english: "1st Lieutenant", image: "../assets/ranks/rank-14.png", requirements: ["880 经验", "28 指挥点"] },
        { level: 12, name: "上尉", english: "Captain", image: "../assets/ranks/rank-13.png", requirements: ["1000 经验", "32 指挥点"] }
    ],
    support: [
        { level: 6, name: "马鞍军士", english: "Saddler Sergeant", image: "../assets/ranks/rank-32.png", requirements: ["400 经验", "10 勤务点"] },
        { level: 7, name: "勤务军士", english: "Orderly Sergeant", image: "../assets/ranks/rank-33.png", requirements: ["520 经验", "16 勤务点"] },
        { level: 8, name: "军需军士", english: "Q.M. Sergeant", image: "../assets/ranks/rank-31.png", requirements: ["640 经验", "20 勤务点"] },
        { level: 9, name: "参谋军士长", english: "Staff Sergeant Major", image: "../assets/ranks/rank-30.png", requirements: ["760 经验", "24 勤务点"] },
        { level: 10, name: "少尉", english: "2nd Lieutenant", image: "../assets/ranks/rank-25.png", requirements: ["880 经验", "28 勤务点"] },
        { level: 11, name: "中尉", english: "1st Lieutenant", image: "../assets/ranks/rank-24.png", requirements: ["管理组综合评定"] }
    ],
    special: [
        { level: "特别", name: "随军牧师", english: "Chaplain", image: "../assets/ranks/rank-23.png", requirements: ["特殊职责", "管理组任命"] }
    ]
};

function createRankCard(rank) {
    const card = document.createElement("article");
    card.className = "rank-card";

    const level = document.createElement("span");
    level.className = "rank-card__level";
    level.textContent = typeof rank.level === "number" ? `RANK ${String(rank.level).padStart(2, "0")}` : rank.level;

    const image = document.createElement("img");
    image.className = "rank-card__badge";
    image.src = rank.image;
    image.alt = `${rank.name}军衔徽章`;
    image.loading = "lazy";

    const content = document.createElement("div");
    content.className = "rank-card__content";

    const name = document.createElement("h3");
    name.textContent = rank.name;

    const english = document.createElement("p");
    english.className = "rank-card__english";
    english.textContent = rank.english;

    const requirements = document.createElement("ul");
    requirements.className = "rank-card__requirements";
    rank.requirements.forEach((requirement) => {
        const item = document.createElement("li");
        item.textContent = requirement;
        requirements.append(item);
    });

    content.append(name, english, requirements);
    card.append(level, image, content);
    return card;
}

function renderRankGroup(containerId, ranks) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const fragment = document.createDocumentFragment();
    ranks.forEach((rank) => fragment.append(createRankCard(rank)));
    container.append(fragment);
}

renderRankGroup("shared-ranks", rankSystem.shared);
renderRankGroup("command-ranks", rankSystem.command);
renderRankGroup("support-ranks", rankSystem.support);
renderRankGroup("special-ranks", rankSystem.special);
