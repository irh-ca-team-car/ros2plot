import express from "express"
import rclnodejs from "rclnodejs"
import ws from "express-ws"
import http from "http";
import raz from "raz"
import path from "path"
await rclnodejs.init();

let data_to_subscribe = process.argv.slice(2);
let topics_to_subscribe = [... new Set(process.argv.slice(2).map(x => x.split(":")[0]))];
let data_per_topic = {

}
for (var topic of topics_to_subscribe) {
    var data_from_message = data_to_subscribe.filter(x => x.startsWith(topic)).map(x => x.split(":")[1]);
    console.log(topic, data_from_message)

    data_per_topic[topic] = data_from_message;
}
console.log(topics_to_subscribe);

const node = new rclnodejs.Node('ros2plot');

node.spinOnce(1);


const app = express();
app.set('view engine', "raz");

for (var port = 8000; port < 9000; port++) {
    try {
        let server = await tryListen(8000);

        ws(app, server);

        break;
    }
    catch {

    }
}

app.use(express.static('node_modules/d3'))
app.use(express.static('node_modules/c3'))
app.use(express.static('public'))

app.get("/", (req, res) => {
    res.render("index");
})
let sockets = []
app.ws("/ws", function (ws, req) {
    console.log("Attempting ws connection");
    ws.on('message', function (msg) {
        console.warn("Websocket is trying to send data, this is a push only ",msg);
    });
    ws.on("close", () => {
        sockets = sockets.filter(x => x != ws);
    })
    sockets.push(ws);

})

let subscriptions = {

};
/**
 * 
 * @param {number} port 
 * @returns {Promise<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>>}
 */
function tryListen(port) {
    return new Promise((acc, rej) => {
        var server = http.createServer(app);
        server.on("error", rej);
        server.listen(port, () => {
            acc(server);
            console.log("Listening to http://localhost:" + server.address().port)
        });
    });
}

function dataProcess(message, topic) {
    if (sockets.length > 0) {
        let time = node.getClock().now().secondsAndNanoseconds;

        let formatted = {
            time,
            data: {

            }
        }

        let data_from_message = data_per_topic[topic];
        for (let data_path of data_from_message) {
            try {
                let data = eval("message." + data_path);
                formatted.data[topic + ":" + data_path] = data;
            }
            catch {

            }
        }
        var f = JSON.stringify(formatted);
        sockets.forEach(sock => sock.send(f));
    }
}
function setNewSubscriptions() {
    let completed = true;
    let topics = node.getTopicNamesAndTypes();
    for (let topic of topics) {
        if (topics_to_subscribe.includes(topic.name) && !subscriptions[topic.name]) {
            (function (topic) {
                console.log("Subscribing to ", topic.name, "type=", topic.types[0]);
                subscriptions[topic.name] = node.createSubscription(topic.types[0], topic.name, (message) => {
                    dataProcess(message, topic.name);
                });
            })(topic);
        }
    }
    for (let topic of topics_to_subscribe) {
        if (!subscriptions[topic])
            completed = false;
    }

    if (completed) {
        console.log("All topics subscribed, disabling discovery loop");
        if (setNewSubscriptionsInternal)
            clearInterval(setNewSubscriptionsInternal);
    }
}
var setNewSubscriptionsInternal = setInterval(setNewSubscriptions, 100);

process.on('SIGINT', function () {
    console.log("Caught interrupt signal");
    node.stop();
    process.exit();
});

node.spin();

let counter = 0;
let pub = node.createPublisher("std_msgs/msg/Float64", "/example")

let freq = 50
setInterval(()=>{
    counter += Math.PI*2 / freq;
    pub.publish({ data: Math.sin(counter)});
},1000/(freq))