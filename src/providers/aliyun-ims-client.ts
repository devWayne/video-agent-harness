import CredentialModule from "@alicloud/credentials";
import IceModule from "@alicloud/ice20201109";
import { Config as OpenApiConfig } from "@alicloud/openapi-client";

type Credential = InstanceType<(typeof CredentialModule)["default"]>;
type IceClient = InstanceType<(typeof IceModule)["default"]>;

export interface AliyunImsClientOptions {
  region: string;
  endpoint?: string;
  credential?: Credential;
}

export function createAliyunImsClient(options: AliyunImsClientOptions): IceClient {
  return new IceModule.default(
    new OpenApiConfig({
      credential: options.credential ?? new CredentialModule.default(),
      regionId: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    }),
  );
}
