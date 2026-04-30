const ftp = require("basic-ftp");

async function uploadTestFile() {
    const client = new ftp.Client();
    client.ftp.verbose = true; // useful in Railway logs

    try {
        console.log("Starting FTP connection...");

        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        console.log("Connected to FTP.");

        const fileContent = "test1";
        const buffer = Buffer.from(fileContent, "utf-8");

        console.log("Ensuring /custom/ directory exists...");
        await client.ensureDir("/custom/");

        console.log("Uploading test.xml...");
        await client.uploadFrom(buffer, "/custom/test.xml");

        console.log("Upload complete.");

        const list = await client.list("/custom/");
        console.log("Directory contents:", list.map(f => f.name));

        console.log("SUCCESS: File uploaded and verified.");

    } catch (err) {
        console.error("FTP UPLOAD FAILED:", err);
    }

    client.close();
}

// Run immediately on start (Railway-friendly)
uploadTestFile();
