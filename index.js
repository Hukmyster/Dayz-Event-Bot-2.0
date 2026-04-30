const ftp = require("basic-ftp");
const { Readable } = require("stream");

async function run() {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        console.log("Connected");

        const folder = "/dayzps_missions/dayzOffline.chernarusplus/custom";
        const filePath = folder + "/test1.xml";

        console.log("Ensuring folder:", folder);
        await client.ensureDir(folder);

        console.log("Uploading file:", filePath);

        // FIX: proper readable stream (this is the key change)
        const stream = Readable.from(["test1"]);

        await client.uploadFrom(stream, filePath);

        console.log("UPLOAD COMPLETE");

        const list = await client.list(folder);
        console.log("FILES:", list.map(f => f.name));

    } catch (err) {
        console.error("FAILED:", err);
    }

    client.close();
}

run();
