#!/usr/bin/env node
/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import { config } from './config';
import * as cdk from '@aws-cdk/core';

import {
  ImageBuilderPipeline,
  OSType,
} from 'aws-rfdk/deadline';

  // ------------------------------ //
  // --- Validate Config Values --- //
  // ------------------------------ //

  if (!config.ublCertificatesSecretArn && config.ublLicenses) {
    throw new Error('UBL certificates secret ARN is required when using UBL but was not specified.');
  }

  if (!config.ublLicenses) {
    console.warn('No UBL licenses specified. UsageBasedLicensing will be skipped.');
  }

  if (!config.keyPairName) {
    console.log('EC2 key pair name not specified. You will not have SSH access to the render farm.');
  }

  if (config.deadlineClientLinuxAmiMap === {['region']: 'ami-id'}) {
    throw new Error('Deadline Client Linux AMI map is required but was not specified.');
  }

// ------------------- //
// --- Application --- //
// ------------------- //

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

const stack = new cdk.Stack(app, 'PocStack', { env });

new ImageBuilderPipeline(stack, 'DeadlineBuildingPipeline', {
  osType: OSType.LINUX,
  parentAmi: 'arn:aws:imagebuilder:us-west-2:121858446379:image/my-first-recipe/x.x.x',
});
