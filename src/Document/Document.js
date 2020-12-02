/**
* Document: A Lambda function that creates a Systems Manager Document in either YAML or JSON format,
* from either in-lin content or external content stored in an S3 Bucket.
* Currently only Command Documents are supported.
**/

const response = require('cfn-response-promise');

const AWS = require('aws-sdk');
AWS.config.apiVersions = {
  s3: '2006-03-01',
  ssm: '2014-11-06'
};

const s3 = new AWS.S3();
const ssm = new AWS.SSM();

const getObject = async (bucket, key, versionId) => {
  const params = {
    Bucket: bucket,
    Key: key
  };
  if (versionId) params.VersionId = versionId;
  data = await s3.getObject(params).promise();

  return data.Body.toString('utf-8');;
};

const createDocument = async (name, documentType, documentFormat, content, tags) => {
  const params = {
    Name: name,
    DocumentType: documentType,
    DocumentFormat: documentFormat,
    Content: content,
    Tags: tags
  };
  const data = await ssm.createDocument(params).promise();
  console.info(`- createDocument Data:\n${JSON.stringify(data, null, 2)}`);

  return;
};

const updateDocument = async (name, documentFormat, content) => {
  const params = {
    Name: name,
    DocumentFormat: documentFormat,
    Content: content
  };
  const data = await ssm.updateDocument(params).promise();
  console.info(`- updateDocument Data:\n${JSON.stringify(data, null, 2)}`);

  return;
};

const deleteDocument = async (name) => {
  const params = {
    Name: name
  };
  const data = await ssm.deleteDocument(params).promise();
  console.info(`- deleteDocument Data:\n${JSON.stringify(data, null, 2)}`);

  return;
};

exports.handler = async (event, context) => {
  console.info(`Request body:\n${JSON.stringify(event)}`);

  let name;
  let documentType;
  let documentFormat;
  let content;
  let bucket;
  let key;
  let versionId;
  let tags;

  try {
    name = event.ResourceProperties.Name;
    if (! name) {
      throw new Error(`Name missing: required Parameter`);
    }
    console.info(`Name: ${name}`);

    if (event.RequestType != 'Delete') {
      documentFormat = event.ResourceProperties.DocumentFormat;
      if ( ! /^(YAML|JSON)$/.test(documentFormat)) {
        throw new Error(`DocumentFormat invalid: must be 'YAML' or 'JSON'`);
      }
      console.info(`DocumentFormat: ${documentFormat}`);

      content = event.ResourceProperties.Content;
      bucket = event.ResourceProperties.S3Bucket;
      key = event.ResourceProperties.S3Key;
      versionId = event.ResourceProperties.S3ObjectVersion || null;
      if (content) {
        if (bucket || key) {
          throw new Error(`S3Bucket and/or S3Key invalid: S3Bucket and/or S3Key cannot be specified when Content is specified`);
        }
      } else {
        if (! bucket && key) {
          throw new Error(`S3Bucket without S3Key invalid: Both S3Bucket and S3Key are required when Content is not specified`);
        }
        content = await getObject(bucket, key, versionId);
      }
      console.info(`Content: ${content}`);

      if (event.RequestType == 'Create') {
        documentType = event.ResourceProperties.DocumentType;
        if ( ! /^Command$/.test(documentType)) {
          throw new Error(`DocumentType invalid: must be 'Command' (currently)`);
        }
        console.info(`DocumentType: ${documentType}`);

        tags = event.ResourceProperties.Tags;
        console.info(`Tags: ${tags}`);
      }
    }
  }
  catch (err) {
    const responseData = {Error: `${(err.code) ? err.code : 'Error'}: ${err.message}`};
    console.error(responseData.Error);
    await response.send(event, context, response.FAILED, responseData);
  }

  switch (event.RequestType) {
    case 'Create':
      try {
        console.info(`Calling: createDocument...`);
        await createDocument(name, documentType, documentFormat, content, tags);
        console.info(`Document: ${name} created`);

        await response.send(event, context, response.SUCCESS, {}, name);
      }
      catch (err) {
        const responseData = {Error: `${(err.code) ? err.code : 'Error'}: ${err.message}`};
        console.error(responseData.Error);
        await response.send(event, context, response.FAILED, responseData);
      }
      break;

    case 'Update':
      try {
        console.info(`Calling: updateDocument...`);
        await updateDocument(name, documentFormat, content);
        console.info(`Document: ${name} updated`);

        await response.send(event, context, response.SUCCESS, {}, remoteDomainName);
      }
      catch (err) {
        const responseData = {Error: `${(err.code) ? err.code : 'Error'}: ${err.message}`};
        console.error(responseData.Error);
        await response.send(event, context, response.FAILED, responseData);
      }
      break;

    case 'Delete':
      try {
        console.info(`Calling: deleteDocument...`);
        await deleteDocument(name);
        console.info(`Document: ${name} deleted`);

        await response.send(event, context, response.SUCCESS);
      }
      catch (err) {
        const responseData = {Error: `${(err.code) ? err.code : 'Error'}: ${err.message}`};
        console.error(responseData.Error);
        await response.send(event, context, response.FAILED, responseData);
      }
  }
};
