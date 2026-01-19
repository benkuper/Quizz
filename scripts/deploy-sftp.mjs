import SftpClient from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function deploy() {
    const sftp = new SftpClient();
    
    try {
        // Read config from .vscode/sftp.json
        const configPath = path.resolve(__dirname, '../.vscode/sftp.json');
        
        if (!fs.existsSync(configPath)) {
            throw new Error(`SFTP config file not found at ${configPath}`);
        }

        const configRaw = fs.readFileSync(configPath, 'utf8');
        // sftp.json might contain comments which JSON.parse handles if we are lucky, 
        // but standard JSON doesn't. The extension sets standard JSON usually.
        // If it fails, we might need a looser parser, but let's try standard first.
        const config = JSON.parse(configRaw);

        console.log(`Connecting to ${config.host} as ${config.username}...`);

        await sftp.connect({
            host: config.host,
            port: config.port || 22,
            username: config.username,
            password: config.password,
            // Add private key support if needed later, but password is in the file
        });

        console.log('Connected.');

        const localDir = path.resolve(__dirname, '../build');
        const remoteDir = config.remotePath;

        if (!fs.existsSync(localDir)) {
            throw new Error(`Build directory not found at ${localDir}. Be sure to run "npm run build" first.`);
        }

        console.log(`Uploading ${localDir} to ${remoteDir} ...`);

        // syncDir uploads the directory
        sftp.on('upload', info => {
            console.log(`Uploaded ${info.source}`);
        });

        await sftp.uploadDir(localDir, remoteDir);

        console.log('Upload complete!');

    } catch (err) {
        console.error('Deployment failed:', err.message);
        process.exit(1);
    } finally {
        await sftp.end();
    }
}

deploy();
