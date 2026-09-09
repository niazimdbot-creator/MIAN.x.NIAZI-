const commands = {};

commands.ping = async ({ sock, from }) => {
  await sock.sendMessage(from, { text: "Pong! NIAZI-MD is alive" });
};

commands.alive = async ({ sock, from, config }) => {
  await sock.sendMessage(from, {
    text: `*${config.botName}* is Online!\nOwner: ${config.ownerNumber.split("@")[0]}\nChannel: ${config.channelLink}`
  });
};

commands.menu = async ({ sock, from, config }) => {
  await sock.sendMessage(from, {
    text: `*${config.botName} MENU*\n.ping\n.alive\n.menu\n.owner`
  });
};

commands.owner = async ({ sock, from, config }) => {
  await sock.sendMessage(from, { text: `Owner: wa.me/${config.ownerNumber.split("@")[0]}` });
};

module.exports = commands;
