/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.Prompt = (function() {

    /**
     * Properties of a Prompt.
     * @exports IPrompt
     * @interface IPrompt
     * @property {IQuestionAnswerPrompt|null} [basicPrompt] Prompt basicPrompt
     * @property {IApplicationPrompt|null} [applicationPrompt] Prompt applicationPrompt
     * @property {IClozePrompt|null} [clozePrompt] Prompt clozePrompt
     */

    /**
     * Constructs a new Prompt.
     * @exports Prompt
     * @classdesc Represents a Prompt.
     * @implements IPrompt
     * @constructor
     * @param {IPrompt=} [properties] Properties to set
     */
    function Prompt(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * Prompt basicPrompt.
     * @member {IQuestionAnswerPrompt|null|undefined} basicPrompt
     * @memberof Prompt
     * @instance
     */
    Prompt.prototype.basicPrompt = null;

    /**
     * Prompt applicationPrompt.
     * @member {IApplicationPrompt|null|undefined} applicationPrompt
     * @memberof Prompt
     * @instance
     */
    Prompt.prototype.applicationPrompt = null;

    /**
     * Prompt clozePrompt.
     * @member {IClozePrompt|null|undefined} clozePrompt
     * @memberof Prompt
     * @instance
     */
    Prompt.prototype.clozePrompt = null;

    // OneOf field names bound to virtual getters and setters
    var $oneOfFields;

    /**
     * Prompt prompt.
     * @member {"basicPrompt"|"applicationPrompt"|"clozePrompt"|undefined} prompt
     * @memberof Prompt
     * @instance
     */
    Object.defineProperty(Prompt.prototype, "prompt", {
        get: $util.oneOfGetter($oneOfFields = ["basicPrompt", "applicationPrompt", "clozePrompt"]),
        set: $util.oneOfSetter($oneOfFields)
    });

    /**
     * Creates a new Prompt instance using the specified properties.
     * @function create
     * @memberof Prompt
     * @static
     * @param {IPrompt=} [properties] Properties to set
     * @returns {Prompt} Prompt instance
     */
    Prompt.create = function create(properties) {
        return new Prompt(properties);
    };

    /**
     * Encodes the specified Prompt message. Does not implicitly {@link Prompt.verify|verify} messages.
     * @function encode
     * @memberof Prompt
     * @static
     * @param {IPrompt} message Prompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Prompt.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.basicPrompt != null && message.hasOwnProperty("basicPrompt"))
            $root.QuestionAnswerPrompt.encode(message.basicPrompt, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
        if (message.applicationPrompt != null && message.hasOwnProperty("applicationPrompt"))
            $root.ApplicationPrompt.encode(message.applicationPrompt, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
        if (message.clozePrompt != null && message.hasOwnProperty("clozePrompt"))
            $root.ClozePrompt.encode(message.clozePrompt, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified Prompt message, length delimited. Does not implicitly {@link Prompt.verify|verify} messages.
     * @function encodeDelimited
     * @memberof Prompt
     * @static
     * @param {IPrompt} message Prompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Prompt.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a Prompt message from the specified reader or buffer.
     * @function decode
     * @memberof Prompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {Prompt} Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Prompt.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.Prompt();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                message.basicPrompt = $root.QuestionAnswerPrompt.decode(reader, reader.uint32());
                break;
            case 2:
                message.applicationPrompt = $root.ApplicationPrompt.decode(reader, reader.uint32());
                break;
            case 3:
                message.clozePrompt = $root.ClozePrompt.decode(reader, reader.uint32());
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a Prompt message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof Prompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {Prompt} Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Prompt.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a Prompt message.
     * @function verify
     * @memberof Prompt
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    Prompt.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        var properties = {};
        if (message.basicPrompt != null && message.hasOwnProperty("basicPrompt")) {
            properties.prompt = 1;
            {
                var error = $root.QuestionAnswerPrompt.verify(message.basicPrompt);
                if (error)
                    return "basicPrompt." + error;
            }
        }
        if (message.applicationPrompt != null && message.hasOwnProperty("applicationPrompt")) {
            if (properties.prompt === 1)
                return "prompt: multiple values";
            properties.prompt = 1;
            {
                var error = $root.ApplicationPrompt.verify(message.applicationPrompt);
                if (error)
                    return "applicationPrompt." + error;
            }
        }
        if (message.clozePrompt != null && message.hasOwnProperty("clozePrompt")) {
            if (properties.prompt === 1)
                return "prompt: multiple values";
            properties.prompt = 1;
            {
                var error = $root.ClozePrompt.verify(message.clozePrompt);
                if (error)
                    return "clozePrompt." + error;
            }
        }
        return null;
    };

    /**
     * Creates a Prompt message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Prompt
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {Prompt} Prompt
     */
    Prompt.fromObject = function fromObject(object) {
        if (object instanceof $root.Prompt)
            return object;
        var message = new $root.Prompt();
        if (object.basicPrompt != null) {
            if (typeof object.basicPrompt !== "object")
                throw TypeError(".Prompt.basicPrompt: object expected");
            message.basicPrompt = $root.QuestionAnswerPrompt.fromObject(object.basicPrompt);
        }
        if (object.applicationPrompt != null) {
            if (typeof object.applicationPrompt !== "object")
                throw TypeError(".Prompt.applicationPrompt: object expected");
            message.applicationPrompt = $root.ApplicationPrompt.fromObject(object.applicationPrompt);
        }
        if (object.clozePrompt != null) {
            if (typeof object.clozePrompt !== "object")
                throw TypeError(".Prompt.clozePrompt: object expected");
            message.clozePrompt = $root.ClozePrompt.fromObject(object.clozePrompt);
        }
        return message;
    };

    /**
     * Creates a plain object from a Prompt message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Prompt
     * @static
     * @param {Prompt} message Prompt
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Prompt.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (message.basicPrompt != null && message.hasOwnProperty("basicPrompt")) {
            object.basicPrompt = $root.QuestionAnswerPrompt.toObject(message.basicPrompt, options);
            if (options.oneofs)
                object.prompt = "basicPrompt";
        }
        if (message.applicationPrompt != null && message.hasOwnProperty("applicationPrompt")) {
            object.applicationPrompt = $root.ApplicationPrompt.toObject(message.applicationPrompt, options);
            if (options.oneofs)
                object.prompt = "applicationPrompt";
        }
        if (message.clozePrompt != null && message.hasOwnProperty("clozePrompt")) {
            object.clozePrompt = $root.ClozePrompt.toObject(message.clozePrompt, options);
            if (options.oneofs)
                object.prompt = "clozePrompt";
        }
        return object;
    };

    /**
     * Converts this Prompt to JSON.
     * @function toJSON
     * @memberof Prompt
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Prompt.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return Prompt;
})();

$root.ApplicationPrompt = (function() {

    /**
     * Properties of an ApplicationPrompt.
     * @exports IApplicationPrompt
     * @interface IApplicationPrompt
     * @property {Array.<IQuestionAnswerPrompt>|null} [variants] ApplicationPrompt variants
     */

    /**
     * Constructs a new ApplicationPrompt.
     * @exports ApplicationPrompt
     * @classdesc Represents an ApplicationPrompt.
     * @implements IApplicationPrompt
     * @constructor
     * @param {IApplicationPrompt=} [properties] Properties to set
     */
    function ApplicationPrompt(properties) {
        this.variants = [];
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * ApplicationPrompt variants.
     * @member {Array.<IQuestionAnswerPrompt>} variants
     * @memberof ApplicationPrompt
     * @instance
     */
    ApplicationPrompt.prototype.variants = $util.emptyArray;

    /**
     * Creates a new ApplicationPrompt instance using the specified properties.
     * @function create
     * @memberof ApplicationPrompt
     * @static
     * @param {IApplicationPrompt=} [properties] Properties to set
     * @returns {ApplicationPrompt} ApplicationPrompt instance
     */
    ApplicationPrompt.create = function create(properties) {
        return new ApplicationPrompt(properties);
    };

    /**
     * Encodes the specified ApplicationPrompt message. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @function encode
     * @memberof ApplicationPrompt
     * @static
     * @param {IApplicationPrompt} message ApplicationPrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ApplicationPrompt.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.variants != null && message.variants.length)
            for (var i = 0; i < message.variants.length; ++i)
                $root.QuestionAnswerPrompt.encode(message.variants[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified ApplicationPrompt message, length delimited. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @function encodeDelimited
     * @memberof ApplicationPrompt
     * @static
     * @param {IApplicationPrompt} message ApplicationPrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ApplicationPrompt.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer.
     * @function decode
     * @memberof ApplicationPrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {ApplicationPrompt} ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ApplicationPrompt.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ApplicationPrompt();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                if (!(message.variants && message.variants.length))
                    message.variants = [];
                message.variants.push($root.QuestionAnswerPrompt.decode(reader, reader.uint32()));
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof ApplicationPrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {ApplicationPrompt} ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ApplicationPrompt.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an ApplicationPrompt message.
     * @function verify
     * @memberof ApplicationPrompt
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    ApplicationPrompt.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.variants != null && message.hasOwnProperty("variants")) {
            if (!Array.isArray(message.variants))
                return "variants: array expected";
            for (var i = 0; i < message.variants.length; ++i) {
                var error = $root.QuestionAnswerPrompt.verify(message.variants[i]);
                if (error)
                    return "variants." + error;
            }
        }
        return null;
    };

    /**
     * Creates an ApplicationPrompt message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof ApplicationPrompt
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {ApplicationPrompt} ApplicationPrompt
     */
    ApplicationPrompt.fromObject = function fromObject(object) {
        if (object instanceof $root.ApplicationPrompt)
            return object;
        var message = new $root.ApplicationPrompt();
        if (object.variants) {
            if (!Array.isArray(object.variants))
                throw TypeError(".ApplicationPrompt.variants: array expected");
            message.variants = [];
            for (var i = 0; i < object.variants.length; ++i) {
                if (typeof object.variants[i] !== "object")
                    throw TypeError(".ApplicationPrompt.variants: object expected");
                message.variants[i] = $root.QuestionAnswerPrompt.fromObject(object.variants[i]);
            }
        }
        return message;
    };

    /**
     * Creates a plain object from an ApplicationPrompt message. Also converts values to other types if specified.
     * @function toObject
     * @memberof ApplicationPrompt
     * @static
     * @param {ApplicationPrompt} message ApplicationPrompt
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    ApplicationPrompt.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.arrays || options.defaults)
            object.variants = [];
        if (message.variants && message.variants.length) {
            object.variants = [];
            for (var j = 0; j < message.variants.length; ++j)
                object.variants[j] = $root.QuestionAnswerPrompt.toObject(message.variants[j], options);
        }
        return object;
    };

    /**
     * Converts this ApplicationPrompt to JSON.
     * @function toJSON
     * @memberof ApplicationPrompt
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    ApplicationPrompt.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return ApplicationPrompt;
})();

$root.QuestionAnswerPrompt = (function() {

    /**
     * Properties of a QuestionAnswerPrompt.
     * @exports IQuestionAnswerPrompt
     * @interface IQuestionAnswerPrompt
     * @property {string|null} [question] QuestionAnswerPrompt question
     * @property {string|null} [answer] QuestionAnswerPrompt answer
     * @property {string|null} [explanation] QuestionAnswerPrompt explanation
     */

    /**
     * Constructs a new QuestionAnswerPrompt.
     * @exports QuestionAnswerPrompt
     * @classdesc Represents a QuestionAnswerPrompt.
     * @implements IQuestionAnswerPrompt
     * @constructor
     * @param {IQuestionAnswerPrompt=} [properties] Properties to set
     */
    function QuestionAnswerPrompt(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * QuestionAnswerPrompt question.
     * @member {string} question
     * @memberof QuestionAnswerPrompt
     * @instance
     */
    QuestionAnswerPrompt.prototype.question = "";

    /**
     * QuestionAnswerPrompt answer.
     * @member {string} answer
     * @memberof QuestionAnswerPrompt
     * @instance
     */
    QuestionAnswerPrompt.prototype.answer = "";

    /**
     * QuestionAnswerPrompt explanation.
     * @member {string} explanation
     * @memberof QuestionAnswerPrompt
     * @instance
     */
    QuestionAnswerPrompt.prototype.explanation = "";

    /**
     * Creates a new QuestionAnswerPrompt instance using the specified properties.
     * @function create
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {IQuestionAnswerPrompt=} [properties] Properties to set
     * @returns {QuestionAnswerPrompt} QuestionAnswerPrompt instance
     */
    QuestionAnswerPrompt.create = function create(properties) {
        return new QuestionAnswerPrompt(properties);
    };

    /**
     * Encodes the specified QuestionAnswerPrompt message. Does not implicitly {@link QuestionAnswerPrompt.verify|verify} messages.
     * @function encode
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {IQuestionAnswerPrompt} message QuestionAnswerPrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    QuestionAnswerPrompt.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.question != null && message.hasOwnProperty("question"))
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.question);
        if (message.answer != null && message.hasOwnProperty("answer"))
            writer.uint32(/* id 2, wireType 2 =*/18).string(message.answer);
        if (message.explanation != null && message.hasOwnProperty("explanation"))
            writer.uint32(/* id 3, wireType 2 =*/26).string(message.explanation);
        return writer;
    };

    /**
     * Encodes the specified QuestionAnswerPrompt message, length delimited. Does not implicitly {@link QuestionAnswerPrompt.verify|verify} messages.
     * @function encodeDelimited
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {IQuestionAnswerPrompt} message QuestionAnswerPrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    QuestionAnswerPrompt.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a QuestionAnswerPrompt message from the specified reader or buffer.
     * @function decode
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {QuestionAnswerPrompt} QuestionAnswerPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    QuestionAnswerPrompt.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.QuestionAnswerPrompt();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                message.question = reader.string();
                break;
            case 2:
                message.answer = reader.string();
                break;
            case 3:
                message.explanation = reader.string();
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a QuestionAnswerPrompt message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {QuestionAnswerPrompt} QuestionAnswerPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    QuestionAnswerPrompt.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a QuestionAnswerPrompt message.
     * @function verify
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    QuestionAnswerPrompt.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.question != null && message.hasOwnProperty("question"))
            if (!$util.isString(message.question))
                return "question: string expected";
        if (message.answer != null && message.hasOwnProperty("answer"))
            if (!$util.isString(message.answer))
                return "answer: string expected";
        if (message.explanation != null && message.hasOwnProperty("explanation"))
            if (!$util.isString(message.explanation))
                return "explanation: string expected";
        return null;
    };

    /**
     * Creates a QuestionAnswerPrompt message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {QuestionAnswerPrompt} QuestionAnswerPrompt
     */
    QuestionAnswerPrompt.fromObject = function fromObject(object) {
        if (object instanceof $root.QuestionAnswerPrompt)
            return object;
        var message = new $root.QuestionAnswerPrompt();
        if (object.question != null)
            message.question = String(object.question);
        if (object.answer != null)
            message.answer = String(object.answer);
        if (object.explanation != null)
            message.explanation = String(object.explanation);
        return message;
    };

    /**
     * Creates a plain object from a QuestionAnswerPrompt message. Also converts values to other types if specified.
     * @function toObject
     * @memberof QuestionAnswerPrompt
     * @static
     * @param {QuestionAnswerPrompt} message QuestionAnswerPrompt
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    QuestionAnswerPrompt.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.defaults) {
            object.question = "";
            object.answer = "";
            object.explanation = "";
        }
        if (message.question != null && message.hasOwnProperty("question"))
            object.question = message.question;
        if (message.answer != null && message.hasOwnProperty("answer"))
            object.answer = message.answer;
        if (message.explanation != null && message.hasOwnProperty("explanation"))
            object.explanation = message.explanation;
        return object;
    };

    /**
     * Converts this QuestionAnswerPrompt to JSON.
     * @function toJSON
     * @memberof QuestionAnswerPrompt
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    QuestionAnswerPrompt.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return QuestionAnswerPrompt;
})();

$root.ClozePrompt = (function() {

    /**
     * Properties of a ClozePrompt.
     * @exports IClozePrompt
     * @interface IClozePrompt
     * @property {string|null} [body] ClozePrompt body
     */

    /**
     * Constructs a new ClozePrompt.
     * @exports ClozePrompt
     * @classdesc Represents a ClozePrompt.
     * @implements IClozePrompt
     * @constructor
     * @param {IClozePrompt=} [properties] Properties to set
     */
    function ClozePrompt(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * ClozePrompt body.
     * @member {string} body
     * @memberof ClozePrompt
     * @instance
     */
    ClozePrompt.prototype.body = "";

    /**
     * Creates a new ClozePrompt instance using the specified properties.
     * @function create
     * @memberof ClozePrompt
     * @static
     * @param {IClozePrompt=} [properties] Properties to set
     * @returns {ClozePrompt} ClozePrompt instance
     */
    ClozePrompt.create = function create(properties) {
        return new ClozePrompt(properties);
    };

    /**
     * Encodes the specified ClozePrompt message. Does not implicitly {@link ClozePrompt.verify|verify} messages.
     * @function encode
     * @memberof ClozePrompt
     * @static
     * @param {IClozePrompt} message ClozePrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ClozePrompt.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.body != null && message.hasOwnProperty("body"))
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.body);
        return writer;
    };

    /**
     * Encodes the specified ClozePrompt message, length delimited. Does not implicitly {@link ClozePrompt.verify|verify} messages.
     * @function encodeDelimited
     * @memberof ClozePrompt
     * @static
     * @param {IClozePrompt} message ClozePrompt message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ClozePrompt.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a ClozePrompt message from the specified reader or buffer.
     * @function decode
     * @memberof ClozePrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {ClozePrompt} ClozePrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ClozePrompt.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ClozePrompt();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                message.body = reader.string();
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a ClozePrompt message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof ClozePrompt
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {ClozePrompt} ClozePrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ClozePrompt.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a ClozePrompt message.
     * @function verify
     * @memberof ClozePrompt
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    ClozePrompt.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.body != null && message.hasOwnProperty("body"))
            if (!$util.isString(message.body))
                return "body: string expected";
        return null;
    };

    /**
     * Creates a ClozePrompt message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof ClozePrompt
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {ClozePrompt} ClozePrompt
     */
    ClozePrompt.fromObject = function fromObject(object) {
        if (object instanceof $root.ClozePrompt)
            return object;
        var message = new $root.ClozePrompt();
        if (object.body != null)
            message.body = String(object.body);
        return message;
    };

    /**
     * Creates a plain object from a ClozePrompt message. Also converts values to other types if specified.
     * @function toObject
     * @memberof ClozePrompt
     * @static
     * @param {ClozePrompt} message ClozePrompt
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    ClozePrompt.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.defaults)
            object.body = "";
        if (message.body != null && message.hasOwnProperty("body"))
            object.body = message.body;
        return object;
    };

    /**
     * Converts this ClozePrompt to JSON.
     * @function toJSON
     * @memberof ClozePrompt
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    ClozePrompt.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    return ClozePrompt;
})();

$root.ActionLog = (function() {

    /**
     * Properties of an ActionLog.
     * @exports IActionLog
     * @interface IActionLog
     * @property {google.protobuf.ITimestamp|null} [timestamp] ActionLog timestamp
     * @property {ActionLog.IIngest|null} [ingest] ActionLog ingest
     * @property {ActionLog.IRepetition|null} [repetition] ActionLog repetition
     */

    /**
     * Constructs a new ActionLog.
     * @exports ActionLog
     * @classdesc Represents an ActionLog.
     * @implements IActionLog
     * @constructor
     * @param {IActionLog=} [properties] Properties to set
     */
    function ActionLog(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * ActionLog timestamp.
     * @member {google.protobuf.ITimestamp|null|undefined} timestamp
     * @memberof ActionLog
     * @instance
     */
    ActionLog.prototype.timestamp = null;

    /**
     * ActionLog ingest.
     * @member {ActionLog.IIngest|null|undefined} ingest
     * @memberof ActionLog
     * @instance
     */
    ActionLog.prototype.ingest = null;

    /**
     * ActionLog repetition.
     * @member {ActionLog.IRepetition|null|undefined} repetition
     * @memberof ActionLog
     * @instance
     */
    ActionLog.prototype.repetition = null;

    // OneOf field names bound to virtual getters and setters
    var $oneOfFields;

    /**
     * ActionLog log.
     * @member {"ingest"|"repetition"|undefined} log
     * @memberof ActionLog
     * @instance
     */
    Object.defineProperty(ActionLog.prototype, "log", {
        get: $util.oneOfGetter($oneOfFields = ["ingest", "repetition"]),
        set: $util.oneOfSetter($oneOfFields)
    });

    /**
     * Creates a new ActionLog instance using the specified properties.
     * @function create
     * @memberof ActionLog
     * @static
     * @param {IActionLog=} [properties] Properties to set
     * @returns {ActionLog} ActionLog instance
     */
    ActionLog.create = function create(properties) {
        return new ActionLog(properties);
    };

    /**
     * Encodes the specified ActionLog message. Does not implicitly {@link ActionLog.verify|verify} messages.
     * @function encode
     * @memberof ActionLog
     * @static
     * @param {IActionLog} message ActionLog message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ActionLog.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.timestamp != null && message.hasOwnProperty("timestamp"))
            $root.google.protobuf.Timestamp.encode(message.timestamp, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
        if (message.ingest != null && message.hasOwnProperty("ingest"))
            $root.ActionLog.Ingest.encode(message.ingest, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
        if (message.repetition != null && message.hasOwnProperty("repetition"))
            $root.ActionLog.Repetition.encode(message.repetition, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
        return writer;
    };

    /**
     * Encodes the specified ActionLog message, length delimited. Does not implicitly {@link ActionLog.verify|verify} messages.
     * @function encodeDelimited
     * @memberof ActionLog
     * @static
     * @param {IActionLog} message ActionLog message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    ActionLog.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes an ActionLog message from the specified reader or buffer.
     * @function decode
     * @memberof ActionLog
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {ActionLog} ActionLog
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ActionLog.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ActionLog();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
            case 1:
                message.timestamp = $root.google.protobuf.Timestamp.decode(reader, reader.uint32());
                break;
            case 2:
                message.ingest = $root.ActionLog.Ingest.decode(reader, reader.uint32());
                break;
            case 3:
                message.repetition = $root.ActionLog.Repetition.decode(reader, reader.uint32());
                break;
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes an ActionLog message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof ActionLog
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {ActionLog} ActionLog
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    ActionLog.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies an ActionLog message.
     * @function verify
     * @memberof ActionLog
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    ActionLog.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        var properties = {};
        if (message.timestamp != null && message.hasOwnProperty("timestamp")) {
            var error = $root.google.protobuf.Timestamp.verify(message.timestamp);
            if (error)
                return "timestamp." + error;
        }
        if (message.ingest != null && message.hasOwnProperty("ingest")) {
            properties.log = 1;
            {
                var error = $root.ActionLog.Ingest.verify(message.ingest);
                if (error)
                    return "ingest." + error;
            }
        }
        if (message.repetition != null && message.hasOwnProperty("repetition")) {
            if (properties.log === 1)
                return "log: multiple values";
            properties.log = 1;
            {
                var error = $root.ActionLog.Repetition.verify(message.repetition);
                if (error)
                    return "repetition." + error;
            }
        }
        return null;
    };

    /**
     * Creates an ActionLog message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof ActionLog
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {ActionLog} ActionLog
     */
    ActionLog.fromObject = function fromObject(object) {
        if (object instanceof $root.ActionLog)
            return object;
        var message = new $root.ActionLog();
        if (object.timestamp != null) {
            if (typeof object.timestamp !== "object")
                throw TypeError(".ActionLog.timestamp: object expected");
            message.timestamp = $root.google.protobuf.Timestamp.fromObject(object.timestamp);
        }
        if (object.ingest != null) {
            if (typeof object.ingest !== "object")
                throw TypeError(".ActionLog.ingest: object expected");
            message.ingest = $root.ActionLog.Ingest.fromObject(object.ingest);
        }
        if (object.repetition != null) {
            if (typeof object.repetition !== "object")
                throw TypeError(".ActionLog.repetition: object expected");
            message.repetition = $root.ActionLog.Repetition.fromObject(object.repetition);
        }
        return message;
    };

    /**
     * Creates a plain object from an ActionLog message. Also converts values to other types if specified.
     * @function toObject
     * @memberof ActionLog
     * @static
     * @param {ActionLog} message ActionLog
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    ActionLog.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.defaults)
            object.timestamp = null;
        if (message.timestamp != null && message.hasOwnProperty("timestamp"))
            object.timestamp = $root.google.protobuf.Timestamp.toObject(message.timestamp, options);
        if (message.ingest != null && message.hasOwnProperty("ingest")) {
            object.ingest = $root.ActionLog.Ingest.toObject(message.ingest, options);
            if (options.oneofs)
                object.log = "ingest";
        }
        if (message.repetition != null && message.hasOwnProperty("repetition")) {
            object.repetition = $root.ActionLog.Repetition.toObject(message.repetition, options);
            if (options.oneofs)
                object.log = "repetition";
        }
        return object;
    };

    /**
     * Converts this ActionLog to JSON.
     * @function toJSON
     * @memberof ActionLog
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    ActionLog.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    ActionLog.Ingest = (function() {

        /**
         * Properties of an Ingest.
         * @memberof ActionLog
         * @interface IIngest
         * @property {string|null} [taskID] Ingest taskID
         */

        /**
         * Constructs a new Ingest.
         * @memberof ActionLog
         * @classdesc Represents an Ingest.
         * @implements IIngest
         * @constructor
         * @param {ActionLog.IIngest=} [properties] Properties to set
         */
        function Ingest(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Ingest taskID.
         * @member {string} taskID
         * @memberof ActionLog.Ingest
         * @instance
         */
        Ingest.prototype.taskID = "";

        /**
         * Creates a new Ingest instance using the specified properties.
         * @function create
         * @memberof ActionLog.Ingest
         * @static
         * @param {ActionLog.IIngest=} [properties] Properties to set
         * @returns {ActionLog.Ingest} Ingest instance
         */
        Ingest.create = function create(properties) {
            return new Ingest(properties);
        };

        /**
         * Encodes the specified Ingest message. Does not implicitly {@link ActionLog.Ingest.verify|verify} messages.
         * @function encode
         * @memberof ActionLog.Ingest
         * @static
         * @param {ActionLog.IIngest} message Ingest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Ingest.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.taskID != null && message.hasOwnProperty("taskID"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.taskID);
            return writer;
        };

        /**
         * Encodes the specified Ingest message, length delimited. Does not implicitly {@link ActionLog.Ingest.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ActionLog.Ingest
         * @static
         * @param {ActionLog.IIngest} message Ingest message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Ingest.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an Ingest message from the specified reader or buffer.
         * @function decode
         * @memberof ActionLog.Ingest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ActionLog.Ingest} Ingest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Ingest.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ActionLog.Ingest();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1:
                    message.taskID = reader.string();
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes an Ingest message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ActionLog.Ingest
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ActionLog.Ingest} Ingest
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Ingest.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Ingest message.
         * @function verify
         * @memberof ActionLog.Ingest
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Ingest.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.taskID != null && message.hasOwnProperty("taskID"))
                if (!$util.isString(message.taskID))
                    return "taskID: string expected";
            return null;
        };

        /**
         * Creates an Ingest message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ActionLog.Ingest
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ActionLog.Ingest} Ingest
         */
        Ingest.fromObject = function fromObject(object) {
            if (object instanceof $root.ActionLog.Ingest)
                return object;
            var message = new $root.ActionLog.Ingest();
            if (object.taskID != null)
                message.taskID = String(object.taskID);
            return message;
        };

        /**
         * Creates a plain object from an Ingest message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ActionLog.Ingest
         * @static
         * @param {ActionLog.Ingest} message Ingest
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Ingest.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults)
                object.taskID = "";
            if (message.taskID != null && message.hasOwnProperty("taskID"))
                object.taskID = message.taskID;
            return object;
        };

        /**
         * Converts this Ingest to JSON.
         * @function toJSON
         * @memberof ActionLog.Ingest
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Ingest.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return Ingest;
    })();

    ActionLog.Repetition = (function() {

        /**
         * Properties of a Repetition.
         * @memberof ActionLog
         * @interface IRepetition
         * @property {string|null} [taskID] Repetition taskID
         * @property {string|null} [taskParameters] Repetition taskParameters
         * @property {string|null} [outcome] Repetition outcome
         * @property {string|null} [context] Repetition context
         */

        /**
         * Constructs a new Repetition.
         * @memberof ActionLog
         * @classdesc Represents a Repetition.
         * @implements IRepetition
         * @constructor
         * @param {ActionLog.IRepetition=} [properties] Properties to set
         */
        function Repetition(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Repetition taskID.
         * @member {string} taskID
         * @memberof ActionLog.Repetition
         * @instance
         */
        Repetition.prototype.taskID = "";

        /**
         * Repetition taskParameters.
         * @member {string} taskParameters
         * @memberof ActionLog.Repetition
         * @instance
         */
        Repetition.prototype.taskParameters = "";

        /**
         * Repetition outcome.
         * @member {string} outcome
         * @memberof ActionLog.Repetition
         * @instance
         */
        Repetition.prototype.outcome = "";

        /**
         * Repetition context.
         * @member {string} context
         * @memberof ActionLog.Repetition
         * @instance
         */
        Repetition.prototype.context = "";

        /**
         * Creates a new Repetition instance using the specified properties.
         * @function create
         * @memberof ActionLog.Repetition
         * @static
         * @param {ActionLog.IRepetition=} [properties] Properties to set
         * @returns {ActionLog.Repetition} Repetition instance
         */
        Repetition.create = function create(properties) {
            return new Repetition(properties);
        };

        /**
         * Encodes the specified Repetition message. Does not implicitly {@link ActionLog.Repetition.verify|verify} messages.
         * @function encode
         * @memberof ActionLog.Repetition
         * @static
         * @param {ActionLog.IRepetition} message Repetition message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Repetition.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.taskID != null && message.hasOwnProperty("taskID"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.taskID);
            if (message.taskParameters != null && message.hasOwnProperty("taskParameters"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.taskParameters);
            if (message.outcome != null && message.hasOwnProperty("outcome"))
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.outcome);
            if (message.context != null && message.hasOwnProperty("context"))
                writer.uint32(/* id 8, wireType 2 =*/66).string(message.context);
            return writer;
        };

        /**
         * Encodes the specified Repetition message, length delimited. Does not implicitly {@link ActionLog.Repetition.verify|verify} messages.
         * @function encodeDelimited
         * @memberof ActionLog.Repetition
         * @static
         * @param {ActionLog.IRepetition} message Repetition message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Repetition.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Repetition message from the specified reader or buffer.
         * @function decode
         * @memberof ActionLog.Repetition
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {ActionLog.Repetition} Repetition
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Repetition.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.ActionLog.Repetition();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1:
                    message.taskID = reader.string();
                    break;
                case 6:
                    message.taskParameters = reader.string();
                    break;
                case 7:
                    message.outcome = reader.string();
                    break;
                case 8:
                    message.context = reader.string();
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Repetition message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof ActionLog.Repetition
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {ActionLog.Repetition} Repetition
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Repetition.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Repetition message.
         * @function verify
         * @memberof ActionLog.Repetition
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Repetition.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.taskID != null && message.hasOwnProperty("taskID"))
                if (!$util.isString(message.taskID))
                    return "taskID: string expected";
            if (message.taskParameters != null && message.hasOwnProperty("taskParameters"))
                if (!$util.isString(message.taskParameters))
                    return "taskParameters: string expected";
            if (message.outcome != null && message.hasOwnProperty("outcome"))
                if (!$util.isString(message.outcome))
                    return "outcome: string expected";
            if (message.context != null && message.hasOwnProperty("context"))
                if (!$util.isString(message.context))
                    return "context: string expected";
            return null;
        };

        /**
         * Creates a Repetition message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof ActionLog.Repetition
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {ActionLog.Repetition} Repetition
         */
        Repetition.fromObject = function fromObject(object) {
            if (object instanceof $root.ActionLog.Repetition)
                return object;
            var message = new $root.ActionLog.Repetition();
            if (object.taskID != null)
                message.taskID = String(object.taskID);
            if (object.taskParameters != null)
                message.taskParameters = String(object.taskParameters);
            if (object.outcome != null)
                message.outcome = String(object.outcome);
            if (object.context != null)
                message.context = String(object.context);
            return message;
        };

        /**
         * Creates a plain object from a Repetition message. Also converts values to other types if specified.
         * @function toObject
         * @memberof ActionLog.Repetition
         * @static
         * @param {ActionLog.Repetition} message Repetition
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Repetition.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.taskID = "";
                object.taskParameters = "";
                object.outcome = "";
                object.context = "";
            }
            if (message.taskID != null && message.hasOwnProperty("taskID"))
                object.taskID = message.taskID;
            if (message.taskParameters != null && message.hasOwnProperty("taskParameters"))
                object.taskParameters = message.taskParameters;
            if (message.outcome != null && message.hasOwnProperty("outcome"))
                object.outcome = message.outcome;
            if (message.context != null && message.hasOwnProperty("context"))
                object.context = message.context;
            return object;
        };

        /**
         * Converts this Repetition to JSON.
         * @function toJSON
         * @memberof ActionLog.Repetition
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Repetition.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return Repetition;
    })();

    return ActionLog;
})();

$root.google = (function() {

    /**
     * Namespace google.
     * @exports google
     * @namespace
     */
    var google = {};

    google.protobuf = (function() {

        /**
         * Namespace protobuf.
         * @memberof google
         * @namespace
         */
        var protobuf = {};

        protobuf.Timestamp = (function() {

            /**
             * Properties of a Timestamp.
             * @memberof google.protobuf
             * @interface ITimestamp
             * @property {number|Long|null} [seconds] Timestamp seconds
             * @property {number|null} [nanos] Timestamp nanos
             */

            /**
             * Constructs a new Timestamp.
             * @memberof google.protobuf
             * @classdesc Represents a Timestamp.
             * @implements ITimestamp
             * @constructor
             * @param {google.protobuf.ITimestamp=} [properties] Properties to set
             */
            function Timestamp(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Timestamp seconds.
             * @member {number|Long} seconds
             * @memberof google.protobuf.Timestamp
             * @instance
             */
            Timestamp.prototype.seconds = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Timestamp nanos.
             * @member {number} nanos
             * @memberof google.protobuf.Timestamp
             * @instance
             */
            Timestamp.prototype.nanos = 0;

            /**
             * Creates a new Timestamp instance using the specified properties.
             * @function create
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {google.protobuf.ITimestamp=} [properties] Properties to set
             * @returns {google.protobuf.Timestamp} Timestamp instance
             */
            Timestamp.create = function create(properties) {
                return new Timestamp(properties);
            };

            /**
             * Encodes the specified Timestamp message. Does not implicitly {@link google.protobuf.Timestamp.verify|verify} messages.
             * @function encode
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {google.protobuf.ITimestamp} message Timestamp message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Timestamp.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.seconds != null && message.hasOwnProperty("seconds"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int64(message.seconds);
                if (message.nanos != null && message.hasOwnProperty("nanos"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.nanos);
                return writer;
            };

            /**
             * Encodes the specified Timestamp message, length delimited. Does not implicitly {@link google.protobuf.Timestamp.verify|verify} messages.
             * @function encodeDelimited
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {google.protobuf.ITimestamp} message Timestamp message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Timestamp.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a Timestamp message from the specified reader or buffer.
             * @function decode
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {google.protobuf.Timestamp} Timestamp
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Timestamp.decode = function decode(reader, length) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.google.protobuf.Timestamp();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    switch (tag >>> 3) {
                    case 1:
                        message.seconds = reader.int64();
                        break;
                    case 2:
                        message.nanos = reader.int32();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a Timestamp message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {google.protobuf.Timestamp} Timestamp
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Timestamp.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a Timestamp message.
             * @function verify
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Timestamp.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.seconds != null && message.hasOwnProperty("seconds"))
                    if (!$util.isInteger(message.seconds) && !(message.seconds && $util.isInteger(message.seconds.low) && $util.isInteger(message.seconds.high)))
                        return "seconds: integer|Long expected";
                if (message.nanos != null && message.hasOwnProperty("nanos"))
                    if (!$util.isInteger(message.nanos))
                        return "nanos: integer expected";
                return null;
            };

            /**
             * Creates a Timestamp message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {google.protobuf.Timestamp} Timestamp
             */
            Timestamp.fromObject = function fromObject(object) {
                if (object instanceof $root.google.protobuf.Timestamp)
                    return object;
                var message = new $root.google.protobuf.Timestamp();
                if (object.seconds != null)
                    if ($util.Long)
                        (message.seconds = $util.Long.fromValue(object.seconds)).unsigned = false;
                    else if (typeof object.seconds === "string")
                        message.seconds = parseInt(object.seconds, 10);
                    else if (typeof object.seconds === "number")
                        message.seconds = object.seconds;
                    else if (typeof object.seconds === "object")
                        message.seconds = new $util.LongBits(object.seconds.low >>> 0, object.seconds.high >>> 0).toNumber();
                if (object.nanos != null)
                    message.nanos = object.nanos | 0;
                return message;
            };

            /**
             * Creates a plain object from a Timestamp message. Also converts values to other types if specified.
             * @function toObject
             * @memberof google.protobuf.Timestamp
             * @static
             * @param {google.protobuf.Timestamp} message Timestamp
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Timestamp.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, false);
                        object.seconds = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.seconds = options.longs === String ? "0" : 0;
                    object.nanos = 0;
                }
                if (message.seconds != null && message.hasOwnProperty("seconds"))
                    if (typeof message.seconds === "number")
                        object.seconds = options.longs === String ? String(message.seconds) : message.seconds;
                    else
                        object.seconds = options.longs === String ? $util.Long.prototype.toString.call(message.seconds) : options.longs === Number ? new $util.LongBits(message.seconds.low >>> 0, message.seconds.high >>> 0).toNumber() : message.seconds;
                if (message.nanos != null && message.hasOwnProperty("nanos"))
                    object.nanos = message.nanos;
                return object;
            };

            /**
             * Converts this Timestamp to JSON.
             * @function toJSON
             * @memberof google.protobuf.Timestamp
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Timestamp.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            return Timestamp;
        })();

        return protobuf;
    })();

    return google;
})();

module.exports = $root;
