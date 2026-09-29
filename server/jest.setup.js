// Keep persistence tests away from the real server/.data/rooms.json.
const os = require('os');
const path = require('path');
process.env.WST_DATA_DIR = path.join(os.tmpdir(), `wst-jest-${process.pid}`);
