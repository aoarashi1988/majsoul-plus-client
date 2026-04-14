

; (function () {
    const lb_urls = [
        'https://lb-hw.maj-soul.net/api/v0/recommend_list',
        "https://lb-v2.maj-soul.net/api/v0/recommend_list",
        "https://lb-cdn.maj-soul.net/api/v0/recommend_list",
        "https://lb-hw.maj-soul.net/api/v0/recommend_list",
        "https://lb-sy.maj-soul.net/api/v0/recommend_list"
    ]
    const ob_urls = [
        "wss://live-hw.maj-soul.net/ob",
        "wss://ob.maj-soul.net/ob",
        "wss://ob.maj-soul.net/ob",
        "wss://live-hw.maj-soul.net/ob",
        "wss://live-sy.maj-soul.net/ob"
    ]
    const autoRun = () => {
        try {
            if (game.LobbyNetMgr.Inst._nets.length && !game.LobbyNetMgr.Inst._nets.inject) {
                game.LobbyNetMgr.Inst._nets = game.LobbyNetMgr.Inst._nets.map((item, index) => {
                    const newItem = Object.create(item)
                    item._lb_url = lb_urls[index]
                    item._ob_url = ob_urls[index]
                    return newItem
                })
                game.LobbyNetMgr.Inst._nets.inject = true
            } else {
                setTimeout(autoRun, 16);
            }

        } catch (error) {
            setTimeout(autoRun, 16);

        }
    }
    autoRun()
})()