Component({
  data: {
    hidden: false,
    selected: 0,
    color: "#999999",
    selectedColor: "#4CAF50",
    list: [
      {
        pagePath: "/pages/index/index",
        text: "库存",
        iconPath: "/custom-tab-bar/assets/inventory.png",
        selectedIconPath: "/custom-tab-bar/assets/inventory-active.png"
      },
      {
        pagePath: "/pages/diary/diary",
        text: "日记",
        iconPath: "/custom-tab-bar/assets/diary.png",
        selectedIconPath: "/custom-tab-bar/assets/diary-active.png"
      }
    ]
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    }
  }
});
