'use strict';

/*
 import { Schema, arrayOf, normalize } from 'normalizr';
 import { camelizeKeys } from 'humps';
 import {errorCode} from "yr-domains";
 */

const normalizr = require("normalizr");
const {
    Schema, arrayOf, normalize
} = normalizr;
const humps = require("humps");
const {
    camelizeKeys
} = humps;
const martianDomain = require("martian-domain");
const {
    errorCode
} = martianDomain;
//import 'isomorphic-fetch'
var Symbol = require('es6-symbol');

function callApi(apiEndPoint, init, schema) {

    return fetch(apiEndPoint, init)
        .then(response =>
            response.json().then(json => ({ json, response })))
        .then(({ json, response }) => {
            if (!response.ok || json.error != undefined) {      // 为了避免运营商劫持，服务器可能以200的code来返回错误
                var error;
                if(json.error != undefined) {
                    error = {
                        httpCode: response.status,
                        // ...json.error
                        code: json.error.code,
                        message: json.error.message
                    }
                }
                else {
                    error = {
                        httpCode: response.status,
                        code: errorCode.errorUndefined.code,
                        message: errorCode.errorUndefined.message
                    }
                }
                return Promise.reject(error)
            }

            const camelizedJson = camelizeKeys(json);

            if(schema) {
                return Object.assign({},
                    normalize(camelizedJson, schema)
                );
            }
            else {
                return {
                    result: camelizedJson
                }
            }
        })
}



const API_MW_SYMBOL = Symbol('Call_API');
var netAvailable = true;
function setNetAvailable(value) {
    netAvailable = value;
}

// A Redux middleware that interprets actions with API_MW_SYMBOL info specified.
// Performs the call and promises when such actions are dispatched.
var apiMiddleware =  ({ dispatch, getState }) => next => action => {
    const callAPI = action[API_MW_SYMBOL]

    if (typeof callAPI === 'undefined') {
        return next(action)
    }

    let { endpoint } = callAPI
    const { schema, types, init } = callAPI

    if (typeof endpoint === 'function') {
        endpoint = endpoint(getState())
    }

    if (typeof endpoint !== 'string') {
        throw new Error('Specify a string endpoint URL.')
    }
    if (!schema) {
        // throw new Error('Specify one of the exported Schemas.');
    }
    if (!Array.isArray(types) || types.length !== 3) {
        throw new Error('Expected an array of three action types.')
    }
    if (!types.every(type => typeof type === 'string')) {
        throw new Error('Expected action types to be strings.')
    }

    if(init != null && typeof (init) !== 'object') {
        throw new Error("属性init必须是对象形式");
    }


    function actionWith(data) {
        const finalAction = Object.assign({}, action, data)
        delete finalAction[API_MW_SYMBOL]
        return finalAction
    }

    const [ requestType, successType, failureType ] = types;

    if(!netAvailable) {
        return dispatch({
            type: failureType,
            error: errorCode.errorNetUnavailable
        });
    }

    next(actionWith({ type: requestType }))

    return callApi(endpoint, init, schema).then(
        response => next(actionWith({
            response,
            type: successType
        })),
        error => Promise.reject(next(actionWith({
            type: failureType,
            error: (error) ? (
                (error instanceof Error) ? ({                       // 似乎唯一有可能返回Error对象就是因为网络无法连接
                    code: errorCode.errorFailToAccessServer.code,
                    message: errorCode.errorFailToAccessServer.message
                }) : (error)) : ({
                code: errorCode.errorUndefined.code,
                message: errorCode.errorUndefined.message
            })
        })))
    )
};

module.exports = {
    API_MW_SYMBOL,
    apiMiddleware,
    setNetAvailable
}