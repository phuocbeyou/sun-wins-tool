import { SocketClient } from "./src/socket/socketClient.js";

const client = new SocketClient({
  userId: "user_123",
  roomId: "room_1",
});

client.connect();

// Gửi sự kiện tùy chỉnh
setTimeout(() => {
  client.sendRoomNotify("ready", { message: "I'm ready to play!" });
}, 5000);

// Gọi thủ công yêu cầu user trong phòng gửi lại info
setTimeout(() => {
  client.requestFetchUserInfo("sync coin");
}, 10_000);
