/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';

import {
  CfnComponent,
  CfnDistributionConfiguration,
  CfnImagePipeline,
  CfnImageRecipe,
  CfnInfrastructureConfiguration,
} from '@aws-cdk/aws-imagebuilder';
import { Asset } from '@aws-cdk/aws-s3-assets';
import {
  Construct,
} from '@aws-cdk/core';

import { VersionQuery } from '../version-query';

import { templateComponent } from './template';

export enum OSType {
  WINDOWS = 'Windows',
  LINUX = 'Linux'
}

export interface ImageBuilderPipelineProps {
  // Only support Linux to start, components need to be customizable to the OS
  readonly osType: OSType,

  // The parent image of the image recipe.
  // The string must be either an Image ARN (SemVers is ok) or an AMI ID.
  // For example, to get the latest vesion of your image, use "x.x.x" like:
  // arn:aws:imagebuilder:us-west-2:123456789123:image/my-image/x.x.x
  readonly parentAmi: string,

  // Customer defined components
  readonly componentArns?: string[],

  // If no version is supplied, the latest will be used
  readonly deadlineVersion?: string,

  readonly distributionConfiguration?: CfnDistributionConfiguration,

  // Default to something with enough space to install Deadline
  readonly infrastructureConfiguration?: CfnInfrastructureConfiguration,

  /**
   * The schedule to execute the pipeline on.
   * @default - Every Monday at 10:00 am UTC, regardless of if there are any updates to dependencies
   */
  readonly schedule?: CfnImagePipeline.ScheduleProperty,
}

export class ImageBuilderPipeline extends Construct {
  private static DEFAULT_SCHEDULE = {
    // Build a new image regardless of if there are updates to any pipeline dependencies. We're using this
    // because the Deadline component isn't able to signal when there's an update.
    pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
    // Run every Monday at 10:00 am (UTC)
    scheduleExpression: 'cron(0 10 * * 1)',
  };
  constructor(scope: Construct, id: string, props: ImageBuilderPipelineProps) {
    super(scope, id);

    if (props.osType == OSType.WINDOWS) {
      throw new Error('Support for Windows Images not yet implemented');
    }

    const schedule = props.schedule ?? ImageBuilderPipeline.DEFAULT_SCHEDULE;

    const infrastructureConfiguration = props.infrastructureConfiguration
      ?? new CfnInfrastructureConfiguration(
        scope,
        'InfrastructureConfig',
        {
          name: 'DeadlineInfrastructureConfig',
          instanceProfileName: 'EC2InstanceProfileForImageBuilder',
        });

    const version = new VersionQuery(scope, 'VersionQuery', { version: props?.deadlineVersion });
    const linuxClientInstaller = version.linuxInstallers.client;

    const deadlineComponentDoc = new Asset(scope, 'DeadlineComponentDoc', {
      path: templateComponent({
        templatePath: path.join(__dirname, 'components', 'deadline.component.template'),
        tokens: {
          version: `${linuxClientInstaller.s3Bucket}/${linuxClientInstaller.objectKey}`,
        },
      }),
    });

    const deadlineComponent = new CfnComponent(scope, 'DeadlineComponent', {
      platform: 'Linux',
      version: '1.0.0',
      uri: deadlineComponentDoc.s3ObjectUrl,
      description: 'Installs Deadline',
      name: 'Deadline',
    });

    const componentArnList = [{ componentArn: deadlineComponent.attrArn }];
    props.componentArns?.forEach(arn => {
      componentArnList.push({ componentArn: arn });
    });

    const imageRecipe = new CfnImageRecipe(scope, 'DeadlineRecipe', {
      components: componentArnList,
      name: 'DeadlineInstallationRecipe',
      parentImage: props.parentAmi,
      version: '1.0.0',
    });

    new CfnImagePipeline(scope, 'DeadlinePipeline', {
      imageRecipeArn: imageRecipe.attrArn,
      infrastructureConfigurationArn: infrastructureConfiguration.attrArn,
      name: 'DeadlineInstallationPipeline',
      schedule,
    });
  }
}
