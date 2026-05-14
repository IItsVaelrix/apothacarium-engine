import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 Audio Adapter
 * Uses S3-compatible API to store and retrieve audio tracks.
 */
export class R2AudioAdapter {
    constructor(config) {
        this.client = new S3Client({
            region: 'auto',
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        this.bucket = config.bucketName || 'scholomance-audio';
    }

    async saveTrack(id, buffer, contentType) {
        const key = `tracks/${id}.mp3`;
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType || 'audio/mpeg',
        }));
        return key;
    }

    async getTrackStream(id) {
        const key = `tracks/${id}.mp3`;
        const response = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
        return response.Body;
    }

    async getPresignedUrl(id, expiresIn = 3600) {
        const key = `tracks/${id}.mp3`;
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return await getSignedUrl(this.client, command, { expiresIn });
    }

    async deleteTrack(id) {
        const key = `tracks/${id}.mp3`;
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        }));
    }
}
