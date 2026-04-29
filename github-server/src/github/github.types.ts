// Shared aliases for Octokit response payloads.
//
// `RestEndpointMethodTypes` is generated from GitHub's OpenAPI schema, so
// these types stay correct without us hand-rolling them.

import type { RestEndpointMethodTypes } from "@octokit/rest";

export type PullRequestSummary =
  RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];

export type PullRequestDetail =
  RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];

export type IssueSummary =
  RestEndpointMethodTypes["issues"]["listForRepo"]["response"]["data"][number];

export type Repository =
  RestEndpointMethodTypes["repos"]["get"]["response"]["data"];

export type IssueComment =
  RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"];
