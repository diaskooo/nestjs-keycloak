/**
 * File: /src/keycloak.service.ts
 * Project: nestjs-keycloak
 * File Created: 14-07-2021 11:43:59
 * Author: Clay Risser <email@clayrisser.com>
 * -----
 * Last Modified: 28-12-2021 05:29:22
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
import Token from "keycloak-connect/middleware/auth-utils/token";
import UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation";
import qs from "qs";
import { AxiosResponse } from "axios";
import { Grant, Keycloak } from "keycloak-connect";
import { HttpService } from "@nestjs/axios";
import { REQUEST } from "@nestjs/core";
import { Request, NextFunction } from "express";
import { lastValueFrom } from "rxjs";
import {
  Injectable,
  Inject,
  Scope,
  ExecutionContext,
  Logger,
} from "@nestjs/common";
import { CREATE_KEYCLOAK_ADMIN } from "./createKeycloakAdmin.provider";
import { KEYCLOAK } from "./keycloak.provider";
import { getReq } from "./util";
import {
  AuthorizationCodeGrantOptions,
  GrantTokensOptions,
  GraphqlCtx,
  KEYCLOAK_OPTIONS,
  KeycloakError,
  KeycloakOptions,
  KeycloakRequest,
  PasswordGrantOptions,
  RefreshTokenGrant,
  RefreshTokenGrantOptions,
  UserInfo,
} from "./types";

@Injectable({ scope: Scope.REQUEST })
export default class KeycloakService {
  private options: KeycloakOptions;

  private logger = new Logger(KeycloakService.name);

  constructor(
    @Inject(KEYCLOAK_OPTIONS) options: KeycloakOptions,
    @Inject(KEYCLOAK) private readonly keycloak: Keycloak,
    private readonly httpService: HttpService,
    @Inject(REQUEST)
    reqOrExecutionContext:
      | KeycloakRequest<Request>
      | ExecutionContext
      | GraphqlCtx,
    @Inject(CREATE_KEYCLOAK_ADMIN)
    private readonly createKeycloakAdmin?: () => Promise<KcAdminClient | void>
  ) {
    this.options = {
      enforceIssuedByClient: false,
      ...options,
    };
    this.req = getReq(reqOrExecutionContext);
  }

  req: KeycloakRequest<Request>;

  private _bearerToken: Token | null = null;

  private _refreshToken: Token | null = null;

  private _accessToken: Token | null = null;

  private _userInfo: UserInfo | null = null;

  private _initialized = false;

  get bearerToken(): Token | null {
    if (this._bearerToken) return this._bearerToken;
    const { clientId, strict } = this.options;
    const { authorization } = this.req.headers;
    if (typeof authorization === "undefined") return null;
    if (authorization?.indexOf(" ") <= -1) {
      if (strict) return null;
      this._bearerToken = new Token(authorization, clientId);
      return this._bearerToken;
    }
    const authorizationArr = authorization?.split(" ");
    if (
      authorizationArr &&
      authorizationArr[0] &&
      authorizationArr[0].toLowerCase() === "bearer"
    ) {
      this._bearerToken = new Token(authorizationArr[1], clientId);
      return this._bearerToken;
    }
    return null;
  }

  get refreshToken(): Token | null {
    const { clientId } = this.options;
    if (this._refreshToken) return this._refreshToken;
    this._refreshToken = this.req.session?.kauth?.refreshToken
      ? new Token(this.req.session?.kauth.refreshToken, clientId)
      : null;
    return this._refreshToken;
  }

  private get baseUrl(): string {
    if (!this.req) return "";
    const { req } = this;
    const host =
      (req.get("x-forwarded-host")
        ? req.get("x-forwarded-host")
        : req.get("host")) ||
      `${req.hostname}${
        req.get("x-forwarded-port") ? `:${req.get("x-forwarded-port")}` : ""
      }`;
    if (!host) return req.originalUrl;
    return `${req.get("x-forwarded-proto") || req.protocol}://${host}`;
  }

  // this is used privately to prevent a circular dependency
  // because this.init() depends on it getting the grant
  // please use this.getGrant() instead
  private get grant(): Grant | null {
    return this.req.kauth?.grant || null;
  }

  async init(force = false) {
    if (this._initialized && !force) return;
    await this.setGrant();
    await this.setUserInfo(force);
    this._initialized = true;
  }

  async getGrant(): Promise<Grant | null> {
    if (this.grant) return this.grant;
    await this.init();
    return this.grant;
  }

  async getRoles(): Promise<string[] | null> {
    const { clientId } = this.options;
    const accessToken = await this.getAccessToken();
    if (!accessToken) return null;
    return [
      ...(accessToken.content?.realm_access?.roles || []).map(
        (role: string) => `realm:${role}`
      ),
      ...(accessToken.content?.resource_access?.[clientId]?.roles || []),
    ];
  }

  async getScopes(): Promise<string[] | null> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return null;
    return (accessToken.content?.scope || "").split(" ");
  }

  async getAccessToken(): Promise<Token | null> {
    if (this._accessToken) return this._accessToken;
    if (this.bearerToken) {
      this._accessToken = this.bearerToken;
      return this._accessToken;
    }
    const { clientId } = this.options;
    let accessToken = (this.req.kauth?.grant?.access_token as Token) || null;
    if (!accessToken && this.req.session?.kauth?.accessToken) {
      accessToken = new Token(this.req.session?.kauth?.accessToken, clientId);
    }
    if (
      (!accessToken ||
        !this.issuedByClient(accessToken) ||
        accessToken.isExpired()) &&
      this.refreshToken &&
      this.issuedByClient(this.refreshToken)
    ) {
      try {
        const tokens = await this.grantTokens({
          refreshToken: this.refreshToken.token,
        });
        this.sessionSetTokens(tokens.accessToken, tokens.refreshToken);
        if (tokens.accessToken) accessToken = tokens.accessToken;
      } catch (err) {
        const error = err as KeycloakError;
        if (error.statusCode && error.statusCode < 500) {
          this.logger.error(
            `${error.statusCode}:`,
            // @ts-ignore
            ...[error.message ? [error.message] : []],
            ...[error.payload ? [JSON.stringify(error.payload)] : []]
          );
          return null;
        }
        throw error;
      }
    }
    this._accessToken = accessToken;
    return this._accessToken;
  }

  async getUserInfo(force = false): Promise<UserInfo | null> {
    if (this._userInfo && !force) return this._userInfo;
    if (this.req.kauth?.userInfo) {
      this._userInfo = this.req.kauth.userInfo;
      return this._userInfo;
    }
    if (!this.bearerToken && this.req.session?.kauth?.userInfo) {
      this._userInfo = this.req.session.kauth.userInfo;
      return this._userInfo;
    }
    const accessToken = await this.getAccessToken();
    const userInfo =
      accessToken &&
      (await this.keycloak.grantManager.userInfo<
        Token | string,
        {
          email_verified: boolean;
          preferred_username: string;
          sub: string;
          [key: string]: any;
        }
      >(accessToken));
    if (!userInfo) return null;
    const result = {
      ...{
        emailVerified: userInfo?.email_verified,
        preferredUsername: userInfo?.preferred_username,
      },
      ...userInfo,
    } as UserInfo;
    delete result?.email_verified;
    delete result?.preferred_username;
    this._userInfo = result;
    return this._userInfo;
  }

  async grantTokens({
    authorizationCode,
    password,
    redirectUri,
    refreshToken,
    scope,
    username,
  }: GrantTokensOptions): Promise<RefreshTokenGrant> {
    const { clientId, clientSecret } = this.options;
    const scopeArr = [
      "openid",
      ...(Array.isArray(scope) ? scope : (scope || "profile").split(" ")),
    ];
    let data: string;
    if (refreshToken) {
      // refresh token grant
      data = qs.stringify({
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    } else if (authorizationCode && redirectUri) {
      // authorization code grant
      data = qs.stringify({
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        client_id: clientId,
        code: authorizationCode,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      });
    } else {
      // password grant
      if (!username) {
        throw new Error("missing username, authorizationCode or refreshToken");
      }
      data = qs.stringify({
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        client_id: clientId,
        grant_type: "password",
        password: password || "",
        scope: scopeArr.join(" "),
        username,
      });
    }
    try {
      const res = (await lastValueFrom(
        this.httpService.post(
          `${this.options.baseUrl}/auth/realms/${this.options.realm}/protocol/openid-connect/token`,
          data,
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        )
      )) as AxiosResponse<TokenResponseData>;
      const {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        access_token,
        scope,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh_token,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        expires_in,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        refresh_expires_in,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        token_type,
      } = res.data;
      return {
        ...(access_token
          ? { accessToken: new Token(access_token, clientId) }
          : {}),
        ...(expires_in ? { expiresIn: expires_in } : {}),
        ...(refresh_expires_in ? { refreshExpiresIn: refresh_expires_in } : {}),
        ...(refresh_token
          ? { refreshToken: new Token(refresh_token, clientId) }
          : {}),
        ...(token_type ? { tokenType: token_type } : {}),
        message: "authentication successful",
        scope,
      };
    } catch (err) {
      const error = err as KeycloakError;
      if (error.response?.data && error.response?.status) {
        const { data } = error.response;
        error.statusCode = error.response.status;
        error.payload = {
          error: data.error,
          message: data.error_description || "",
          statusCode: error.statusCode,
        };
      }
      throw error;
    }
  }

  async getUserId(): Promise<string | null> {
    const userInfo = await this.getUserInfo();
    return userInfo?.sub || null;
  }

  async getUsername(): Promise<string | null> {
    const userInfo = await this.getUserInfo();
    return userInfo?.preferredUsername || null;
  }

  async isAuthorizedByRoles(
    roles: (string | string[])[] = []
  ): Promise<boolean> {
    await this.init();
    const accessToken = await this.getAccessToken();
    if (!(await this.isAuthenticated())) return false;
    const rolesArr = Array.isArray(roles) ? roles : [roles];
    if (!roles.length) return true;
    return rolesArr.some((role: string | string[]) => {
      const result = Array.isArray(role)
        ? role.every((innerRole: string) => accessToken?.hasRole(innerRole))
        : accessToken?.hasRole(role);
      return result;
    });
  }

  async getUser(userId?: string): Promise<UserRepresentation | null> {
    if (!this.createKeycloakAdmin) return null;
    if (!userId) userId = (await this.getUserId()) || undefined;
    if (!userId) return null;
    const keycloakAdmin = await this.createKeycloakAdmin();
    if (!keycloakAdmin) return null;
    return (await keycloakAdmin.users.findOne({ id: userId })) || null;
  }

  async isAuthenticated(): Promise<boolean> {
    await this.init();
    const accessToken = await this.getAccessToken();
    return (
      !this.grant?.isExpired() &&
      !!accessToken &&
      this.issuedByClient(accessToken) &&
      !accessToken?.isExpired()
    );
  }

  async passwordGrant(
    { username, password, scope }: PasswordGrantOptions,
    persistSession = true
  ): Promise<RefreshTokenGrant | null> {
    const tokens = await this.grantTokens({ username, password, scope });
    const { accessToken, refreshToken } = tokens;
    if (accessToken && !this.issuedByClient(accessToken)) {
      return null;
    }
    if (persistSession) this.sessionSetTokens(accessToken, refreshToken);
    if (accessToken) this._accessToken = accessToken;
    if (refreshToken) this._refreshToken = refreshToken;
    await this.init(true);
    return tokens;
  }

  async refreshTokenGrant(
    options: RefreshTokenGrantOptions,
    persistSession = true
  ): Promise<RefreshTokenGrant | null> {
    const tokens = await this.grantTokens(options);
    const { accessToken, refreshToken } = tokens;
    if (accessToken && !this.issuedByClient(accessToken)) {
      return null;
    }
    if (persistSession) this.sessionSetTokens(accessToken, refreshToken);
    if (accessToken) this._accessToken = accessToken;
    if (refreshToken) this._refreshToken = refreshToken;
    await this.init(true);
    return tokens;
  }

  async authorizationCodeGrant(
    { code, redirectUri }: AuthorizationCodeGrantOptions,
    persistSession = true
  ): Promise<RefreshTokenGrant | null> {
    const tokens = await this.grantTokens({
      authorizationCode: code,
      redirectUri,
    });
    const { accessToken, refreshToken } = tokens;
    if (accessToken && !this.issuedByClient(accessToken)) {
      return null;
    }
    if (persistSession) this.sessionSetTokens(accessToken, refreshToken);
    if (accessToken) this._accessToken = accessToken;
    if (refreshToken) this._refreshToken = refreshToken;
    await this.init(true);
    return tokens;
  }

  async logout() {
    this._accessToken = null;
    this._bearerToken = null;
    this._refreshToken = null;
    this._userInfo = null;
    delete this.req.kauth;
    this._initialized = false;
    if (!this.req.session) return;
    delete this.req.session.kauth;
    delete this.req.session.token;
    await new Promise<void>((resolve, reject) => {
      if (!this.req.session?.destroy) return resolve();
      this.req.session?.destroy((err: Error) => {
        if (err) return reject(err);
        return resolve();
      });
      return null;
    });
  }

  async enforce(permissions: string[]) {
    await this.init();
    return new Promise<boolean>((resolve) => {
      return this.keycloak.enforcer(permissions)(
        this.req,
        {},
        (_: Request, _res: {}, _next: NextFunction) => {
          if (this.req.resourceDenied) return resolve(false);
          return resolve(true);
        }
      );
    });
  }

  private issuedByClient(token: Token, clientId?: string) {
    if (!this.options.enforceIssuedByClient) return true;
    if (!clientId) clientId = this.options.clientId;
    return token.clientId !== clientId;
  }

  private sessionSetTokens(accessToken?: Token, refreshToken?: Token) {
    if (this.req.session) {
      if (!this.req.session.kauth) this.req.session.kauth = {};
      if (refreshToken) {
        this.req.session.kauth.refreshToken = refreshToken.token;
      }
      if (accessToken) {
        this.req.session.kauth.accessToken = accessToken.token;
        this.req.session.token = accessToken.token;
      }
    }
  }

  private async setUserInfo(force = false) {
    const userInfo = await this.getUserInfo(force);
    if (!this.req.kauth) this.req.kauth = {};
    if (userInfo) {
      this.req.kauth.userInfo = userInfo;
      if (this.req.session) {
        if (!this.req.session?.kauth) this.req.session.kauth = {};
        this.req.session.kauth.userInfo = userInfo;
      }
    }
  }

  private async setGrant() {
    const accessToken = await this.getAccessToken();
    if (!this.req.kauth) this.req.kauth = {};
    if (!accessToken) return;
    const grant = await this.createGrant(
      accessToken,
      this.refreshToken || undefined
    );
    if (grant) this.req.kauth.grant = grant;
  }

  private async createGrant(
    accessToken?: Token,
    refreshToken?: Token
  ): Promise<Grant | null> {
    if (!accessToken) {
      const token = await this.getAccessToken();
      if (!token) return null;
      accessToken = token;
    }
    if (!refreshToken) {
      const token = this.refreshToken;
      if (token) refreshToken = token;
    }
    return this.keycloak.grantManager.createGrant({
      // access_token is actually a string even though keycloak-connect
      // thinks it is a Token
      // @ts-ignore
      access_token: accessToken.token,
      // refresh_token is actually a string even though keycloak-connect
      // thinks it is a Token
      ...(refreshToken ? { refresh_token: refreshToken.token } : {}),
      // refresh_token is actually a number even though keycloak-connect
      // thinks it is a string
      ...(accessToken.content?.exp
        ? { expires_in: accessToken.content.exp }
        : {}),
      ...(accessToken.content?.typ
        ? { token_type: accessToken.content.typ }
        : {}),
    });
  }
}

export interface TokenResponseData {
  "not-before-policy"?: number;
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  session_state?: string;
  token_type?: string;
}
