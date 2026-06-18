Component({
  data: {
    hidden: false,
    selected: 0,
    color: "#999999",
    selectedColor: "#4CAF50",
    list: [
      {
        pagePath: "/pages/index/index",
        text: "库存"
      },
      {
        pagePath: "/pages/diary/diary",
        text: "日记"
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
