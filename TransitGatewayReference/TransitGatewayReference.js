/**
* TransitGatewayReference: A Lambda function that returns informaiton about a TransitGateway in
* another Account and shared via RAM.
**/

const response = require('cfn-response-promise');

const AWS = require('aws-sdk');
AWS.config.apiVersions = {
  ec2: '2016-11-15',
  ram: '2018-01-04'
};

const ec2 = new AWS.EC2();
const ram = new AWS.RAM();

const getRemoteResourceShare = async (resourceShareName, senderAccountId) => {
  const params = {
    resourceOwner: 'OTHER-ACCOUNTS',
    name: resourceShareName,
  };
  const data = await ram.getResourceShares(params).promise();
  //console.info(`- GetResourceShares Data:\n${JSON.stringify(data, null, 2)}`);

  const filteredResourceShares = data.resourceShares.filter(rs => (rs.name            == resourceShareName &&
                                                                   rs.owningAccountId == senderAccountId));

  switch (filteredResourceShares.length) {
    case 0:
      return undefined;
    case 1:
      return filteredResourceShares[0];
    default:
      throw new Error(`More than one ResourceShare: ${resourceShareName} (Account: ${senderAccountId}) found`);
   }
};

const getResourceShareInvitation = async (resourceShareName, senderAccountId) => {
  const params = {};
  const data = await ram.getResourceShareInvitations(params).promise();
  //console.info(`- GetResourceShareInvitations Data:\n${JSON.stringify(data, null, 2)}`);

  const filteredResourceShareInvitations = data.resourceShareInvitations.filter(rsi => (rsi.resourceShareName == resourceShareName &&
                                                                                        rsi.senderAccountId   == senderAccountId));

  switch (filteredResourceShareInvitations.length) {
    case 0:
      return undefined;
    case 1:
      return filteredResourceShareInvitations[0];
    default:
      throw new Error(`More than one ResourceShareInvitation for ResourceShare: ${resourceShareName} (Account: ${senderAccountId}) found`);
   }
};

const acceptResourceShareInvitation = async (resourceShareInvitationArn) => {
  const params = {
    resourceShareInvitationArn: resourceShareInvitationArn,
    clientToken: Math.floor(Math.random() * 2**32).toString()
  };
  const data = await ram.acceptResourceShareInvitation(params).promise();
  //console.info(`- AcceptResourceShareInvitation Data:\n${JSON.stringify(data, null, 2)}`);
};

const listTransitGatewayResources = async (resourceShareArn) => {
  const params = {
    resourceOwner: 'OTHER-ACCOUNTS',
    resourceShareArns: [ resourceShareArn ],
    resourceType: 'ec2:TransitGateway'
  };
  const data = await ram.listResources(params).promise();
  //console.info(`- ListResources Data:\n${JSON.stringify(data, null, 2)}`);

  const resources = data.resources;

  switch (resources.length) {
    case 0:
      return undefined;
    case 1:
      return resources[0];
    default:
      throw new Error(`More than one TransitGateway found within ResourceShare`);
   }
};

const getTransitGateway = async (transitGatewayId) => {
  const params = {
    TransitGatewayIds: [ transitGatewayId ]
  };
  const data = await ec2.describeTransitGateways(params).promise();
  //console.info(`- DescribeTransitGateways Data:\n${JSON.stringify(data, null, 2)}`);

  const transitGateways = data.TransitGateways;

  switch (transitGateways.length) {
    case 0:
      return undefined;
    case 1:
      return transitGateways[0];
    default:
      throw new Error(`More than one TransitGateway found`); // Should never happen
   }
};

exports.handler = async (event, context) => {
  console.info(`Request Body:\n${JSON.stringify(event)}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      try {
        const resourceShareName = event.ResourceProperties.ResourceShareName;
        if (! /^([A-Z][a-z]*-)?TransitGatewayResourceShare$/.test(resourceShareName)) {
          throw new Error(`ResourceShareName invalid: must be a valid ResourceShare Name, optionally starting with an EnvironmentName followed by a '-', ending with 'TransitGatewayResourceShare'`);
        }

        const senderAccountId = event.ResourceProperties.SenderAccountId;
        if (! /^[0-9]{12}$/.test(senderAccountId)) {
          throw new Error(`SenderAccountId invalid: must be a valid AWS Account Id`);
        }

        console.info(`ResourceShareName: ${resourceShareName}`);
        console.info(`SenderAccountId: ${senderAccountId}`);

        let resourceShareArn;

        console.info(`Calling: getRemoteResourceShare...`);
        const resourceShare = await getRemoteResourceShare(resourceShareName, senderAccountId);

        if (resourceShare) {
          resourceShareArn = resourceShare.resourceShareArn;
          console.info(`ResourceShare: ${resourceShareName} (${resourceShareArn}) found`);
        }
        else {
          console.info(`Resource Share: ${resourceShareName} not found`);

          console.info('Calling: getResourceShareInvitation...');
          const resourceShareInvitation = await getResourceShareInvitation(resourceShareName, senderAccountId);
          if (resourceShareInvitation) {
            const resourceShareInvitationArn = resourceShareInvitation.resourceShareInvitationArn;
            console.info(`ResourceShareInvitation: ${resourceShareInvitationArn} found`);

            console.info('Calling: acceptResourceShareInvitation...');
            await acceptResourceShareInvitation(resourceShareInvitationArn);
            resourceShareArn = resourceShareInvitation.resourceShareArn;
            console.info(`ResourceShare: ${resourceShareName} (${resourceShareArn}) accepted`);
          }
          else {
            throw new Error(`ResourceShareInvitation for ResourceShare: ${resourceShareName} (Account: ${senderAccountId}) not found`);
          }
        }

        console.info(`Calling: listTransitGatewayResources...`);
        const transitGatewayResource = await listTransitGatewayResources(resourceShareArn);

        if (transitGatewayResource) {
          const transitGatewayId = transitGatewayResource.arn.split('/')[1];
          console.info(`TransitGateway: ${transitGatewayId} found in ResourceShare`);

          console.info(`Calling: getTransitGateway...`);
          const transitGateway = await getTransitGateway(transitGatewayId);

          if (transitGateway) {
            console.info(`TransitGateway: ${transitGatewayId} found`);
            await response.send(event, context, response.SUCCESS, {}, transitGatewayId);
          }
          else {
            throw new Error(`TransitGateway not found`);
          }
        }
        else {
          throw new Error(`TransitGateway not found within ResourceShare`);
        }
      }
      catch (err) {
        const responseData = {Error: `${(err.code) ? err.code : 'Error'}: ${err.message}`};
        console.error(responseData.Error);
        await response.send(event, context, response.FAILED, responseData);
      }
      break;

    case 'Delete':
      await response.send(event, context, response.SUCCESS);
  }
};
