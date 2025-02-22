/**
 * File: /src/util.ts
 * Project: nestjs-keycloak
 * File Created: 15-07-2021 17:43:04
 * Author: Clay Risser <email@clayrisser.com>
 * -----
 * Last Modified: 16-07-2021 18:59:59
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

import { ExecutionContext } from "@nestjs/common";
import { Request, Response } from "express";
import { KeycloakRequest, GraphqlCtx } from "./types";

let nestjsGraphql: any;
try {
  // eslint-disable-next-line global-require
  nestjsGraphql = require("@nestjs/graphql");
} catch (err) {
  // void
}

export function getReq(
  reqOrExecutionContext:
    | KeycloakRequest<Request>
    | ExecutionContext
    | GraphqlCtx,
  allowEmpty = false
): KeycloakRequest<Request> {
  const req = reqOrExecutionContext as KeycloakRequest<Request>;
  const context = reqOrExecutionContext as ExecutionContext;
  const GraphqlCtx = reqOrExecutionContext as GraphqlCtx;
  if (
    typeof context.switchToHttp === "function" &&
    typeof context.getType === "function" &&
    typeof req.headers === "undefined" &&
    typeof GraphqlCtx.req === "undefined"
  ) {
    if (
      (context.getType() as string) === ContextType.Graphql &&
      nestjsGraphql
    ) {
      const ctx =
        nestjsGraphql.GqlExecutionContext.create(context).getContext();
      if (ctx.req) return ctx.req;
      if (allowEmpty) return {} as KeycloakRequest<Request>;
    }
    return context.switchToHttp().getRequest();
  }
  if (typeof GraphqlCtx.req !== "undefined") {
    return GraphqlCtx.req;
  }
  return req;
}

export function getRes(
  resOrExecutionContext: Response | ExecutionContext | GraphqlCtx,
  allowEmpty = false
): Response {
  const res = resOrExecutionContext as Response;
  const context = resOrExecutionContext as ExecutionContext;
  const GraphqlCtx = resOrExecutionContext as GraphqlCtx;
  if (
    typeof context.switchToHttp === "function" &&
    typeof context.getType === "function" &&
    typeof res.send !== "function" &&
    typeof GraphqlCtx.res === "undefined"
  ) {
    if (
      (context.getType() as string) === ContextType.Graphql &&
      nestjsGraphql
    ) {
      const ctx =
        nestjsGraphql.GqlExecutionContext.create(context).getContext();
      if (ctx.res) return ctx.res;
      if (allowEmpty) return {} as Response;
    }
    return context.switchToHttp().getResponse();
  }
  if (typeof GraphqlCtx.res !== "undefined") {
    return GraphqlCtx.res;
  }
  return res;
}

export enum ContextType {
  Graphql = "graphql",
}
