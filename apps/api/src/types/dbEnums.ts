import {
  countryCodeEnum,
  jobSourceEnum,
  jobStatusEnum,
  jobTypeEnum,
  publicJobStatusEnum,
  routingStatusEnum,
  tradeCategoryEnum,
} from "../../db/schema/enums";

export type CountryCode = (typeof countryCodeEnum.enumValues)[number];
export type JobSource = (typeof jobSourceEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type JobType = (typeof jobTypeEnum.enumValues)[number];
export type PublicJobStatus = (typeof publicJobStatusEnum.enumValues)[number];
export type RoutingStatus = (typeof routingStatusEnum.enumValues)[number];
export type TradeCategory = (typeof tradeCategoryEnum.enumValues)[number];

