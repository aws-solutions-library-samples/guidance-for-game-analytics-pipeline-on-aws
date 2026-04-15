/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';
const { Kafka } = require('kafkajs')
const { generateAuthToken } = require('aws-msk-iam-sasl-signer-js')

const config = {
    region: process.env.AWS_REGION,
    brokers: process.env.BROKERS.split(","), // brokers env is a comma string
    topic: process.env.TOPIC,
};

async function oauthBearerTokenProvider(region) {
    // Uses AWS Default Credentials Provider Chain to fetch credentials
    const authTokenResponse = await generateAuthToken({ region });
    return {
        value: authTokenResponse.token
    }
}

const kafka = new Kafka({
    clientId: 'kafka-event-ingestion-lambda',
    brokers: config.brokers,
    ssl: true,
    sasl: {
        mechanism: 'oauthbearer',
        oauthBearerProvider: () => oauthBearerTokenProvider(config.region)
    }
});

const producer = kafka.producer();

exports.handler = async (event, context) => {
    console.log(`Recieved payload ${JSON.stringify(event)}`);
    if (Object.hasOwn(event, "events") && Object.hasOwn(event, "application_id")) {
        if (event.events.length == 0) {
            console.log("No events in payload, exiting early")
            return { success: true };
        }
        await producer.connect();

        let producerPayload = {
            topic: config.topic,
            messages: event.events.map(e => ({ value: JSON.stringify({ event: e, application_id: event.application_id }) }))
        };
        console.log(`Event Payload: ${JSON.stringify(producerPayload)}`);
        await producer.send(producerPayload);

        return { success: true };
    } else {
        throw new Error('Payload does not have an events body or application ID');
    }
};
