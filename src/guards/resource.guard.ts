/**
 * File: /src/guards/resource.guard.ts
 * Project: nestjs-keycloak
 * File Created: 14-07-2021 11:39:50
 * Author: Clay Risser <email@clayrisser.com>
 * -----
 * Last Modified: 10-09-2021 10:21:53
 * Modified By: Clay Risser <email@clayrisser.com>
 * -----
 * Silicon Hills LLC (c) Copyright 2021
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import KcAdminClient from "@keycloak/keycloak-admin-client";
import { HttpService } from "@nestjs/axios";
import { Keycloak } from "keycloak-connect";
import { Reflector } from "@nestjs/core";
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import KeycloakService from "../keycloak.service";
import { KEYCLOAK } from "../keycloak.provider";
import { CREATE_KEYCLOAK_ADMIN } from "../createKeycloakAdmin.provider";
import { KEYCLOAK_OPTIONS, KeycloakOptions } from "../types";
import { RESOURCE, SCOPES } from "../decorators";

declare module "keycloak-connect" {
  interface Keycloak {
    enforcer(
      expectedPermissions: string | string[]
    ): (req: any, res: any, next: any) => any;
  }
}

@Injectable()
export class ResourceGuard implements CanActivate {
  logger = new Logger(ResourceGuard.name);

  constructor(
    @Inject(KEYCLOAK_OPTIONS) private options: KeycloakOptions,
    @Inject(KEYCLOAK) private readonly keycloak: Keycloak,
    private readonly httpService: HttpService,
    private readonly reflector: Reflector,
    @Inject(CREATE_KEYCLOAK_ADMIN)
    private readonly createKeycloakAdmin?: () => Promise<KcAdminClient | void>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const keycloakService = new KeycloakService(
      this.options,
      this.keycloak,
      this.httpService,
      context,
      this.createKeycloakAdmin
    );
    const resource = this.getResource(context);
    if (!resource) return true;
    const scopes = this.getScopes(context);
    if (!scopes.length) return true;
    const username = (await keycloakService.getUserInfo())?.preferredUsername;
    if (!username) return false;
    this.logger.verbose(
      `protecting resource '${resource}' with scopes [ ${scopes.join(", ")} ]`
    );
    const permissions = scopes.map((scope) => `${resource}:${scope}`);
    if (await keycloakService.enforce(permissions)) {
      this.logger.verbose(`resource '${resource}' granted to '${username}'`);
      return true;
    }
    this.logger.verbose(`resource '${resource}' denied to '${username}'`);
    return false;
  }

  private getScopes(context: ExecutionContext) {
    const handlerScopes =
      this.reflector.get<string[]>(SCOPES, context.getHandler()) || [];
    const classScopes =
      this.reflector.get<string[]>(SCOPES, context.getClass()) || [];
    return [...new Set([...handlerScopes, ...classScopes])];
  }

  private getResource(context: ExecutionContext) {
    return this.reflector.get<string>(RESOURCE, context.getClass());
  }
}
