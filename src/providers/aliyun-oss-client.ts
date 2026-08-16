import CredentialModule from "@alicloud/credentials";
import OSS from "ali-oss";
import type { OssStreamClient } from "./aliyun-oss-media-asset-store.js";

export interface AliyunOssClientOptions {
  region: string;
  bucket: string;
  endpoint?: string;
  internal?: boolean;
}

export async function createAliyunOssClient(options: AliyunOssClientOptions): Promise<OSS> {
  const credential = new CredentialModule.default();
  const current = await credential.getCredential();
  if (!current.accessKeyId || !current.accessKeySecret) {
    throw new Error("Alibaba Cloud credential chain did not return an AccessKey pair");
  }

  return new OSS({
    accessKeyId: current.accessKeyId,
    accessKeySecret: current.accessKeySecret,
    ...(current.securityToken
      ? {
          stsToken: current.securityToken,
          refreshSTSToken: async () => {
            const refreshed = await credential.getCredential();
            if (!refreshed.accessKeyId || !refreshed.accessKeySecret || !refreshed.securityToken) {
              throw new Error("Alibaba Cloud credential refresh did not return STS credentials");
            }
            return {
              accessKeyId: refreshed.accessKeyId,
              accessKeySecret: refreshed.accessKeySecret,
              stsToken: refreshed.securityToken,
            };
          },
        }
      : {}),
    bucket: options.bucket,
    region: options.region,
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    ...(options.internal === undefined ? {} : { internal: options.internal }),
    secure: true,
    authorizationV4: true,
  });
}

export function createLazyAliyunOssClient(options: AliyunOssClientOptions): OssStreamClient {
  let clientPromise: Promise<OSS> | undefined;
  const getClient = () => (clientPromise ??= createAliyunOssClient(options));
  return {
    async putStream(objectKey, stream, putOptions) {
      const client = await getClient();
      return client.putStream(objectKey, stream, putOptions as OSS.PutStreamOptions);
    },
    async signatureUrl(objectKey, signatureOptions) {
      const client = await getClient();
      return client.signatureUrl(objectKey, signatureOptions);
    },
  };
}
