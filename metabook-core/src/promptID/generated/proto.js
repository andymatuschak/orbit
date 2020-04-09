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

module.exports = $root;
