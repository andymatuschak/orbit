import * as $protobuf from "protobufjs";
/** Properties of a PromptSpec. */
export interface IPromptSpec {

    /** PromptSpec basicPrompt */
    basicPrompt?: (IQuestionAnswerPrompt|null);

    /** PromptSpec applicationPrompt */
    applicationPrompt?: (IApplicationPrompt|null);

    /** PromptSpec clozePrompt */
    clozePrompt?: (IClozePrompt|null);
}

/** Represents a PromptSpec. */
export class PromptSpec implements IPromptSpec {

    /**
     * Constructs a new PromptSpec.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPromptSpec);

    /** PromptSpec basicPrompt. */
    public basicPrompt?: (IQuestionAnswerPrompt|null);

    /** PromptSpec applicationPrompt. */
    public applicationPrompt?: (IApplicationPrompt|null);

    /** PromptSpec clozePrompt. */
    public clozePrompt?: (IClozePrompt|null);

    /** PromptSpec prompt. */
    public prompt?: ("basicPrompt"|"applicationPrompt"|"clozePrompt");

    /**
     * Creates a new PromptSpec instance using the specified properties.
     * @param [properties] Properties to set
     * @returns PromptSpec instance
     */
    public static create(properties?: IPromptSpec): PromptSpec;

    /**
     * Encodes the specified PromptSpec message. Does not implicitly {@link PromptSpec.verify|verify} messages.
     * @param message PromptSpec message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPromptSpec, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified PromptSpec message, length delimited. Does not implicitly {@link PromptSpec.verify|verify} messages.
     * @param message PromptSpec message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPromptSpec, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a PromptSpec message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns PromptSpec
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): PromptSpec;

    /**
     * Decodes a PromptSpec message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns PromptSpec
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): PromptSpec;

    /**
     * Verifies a PromptSpec message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a PromptSpec message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns PromptSpec
     */
    public static fromObject(object: { [k: string]: any }): PromptSpec;

    /**
     * Creates a plain object from a PromptSpec message. Also converts values to other types if specified.
     * @param message PromptSpec
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: PromptSpec, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this PromptSpec to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of an ApplicationPrompt. */
export interface IApplicationPrompt {

    /** ApplicationPrompt variants */
    variants?: (IQuestionAnswerPrompt[]|null);
}

/** Represents an ApplicationPrompt. */
export class ApplicationPrompt implements IApplicationPrompt {

    /**
     * Constructs a new ApplicationPrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IApplicationPrompt);

    /** ApplicationPrompt variants. */
    public variants: IQuestionAnswerPrompt[];

    /**
     * Creates a new ApplicationPrompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ApplicationPrompt instance
     */
    public static create(properties?: IApplicationPrompt): ApplicationPrompt;

    /**
     * Encodes the specified ApplicationPrompt message. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @param message ApplicationPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IApplicationPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ApplicationPrompt message, length delimited. Does not implicitly {@link ApplicationPrompt.verify|verify} messages.
     * @param message ApplicationPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IApplicationPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ApplicationPrompt;

    /**
     * Decodes an ApplicationPrompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ApplicationPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ApplicationPrompt;

    /**
     * Verifies an ApplicationPrompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates an ApplicationPrompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ApplicationPrompt
     */
    public static fromObject(object: { [k: string]: any }): ApplicationPrompt;

    /**
     * Creates a plain object from an ApplicationPrompt message. Also converts values to other types if specified.
     * @param message ApplicationPrompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ApplicationPrompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ApplicationPrompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of a QuestionAnswerPrompt. */
export interface IQuestionAnswerPrompt {

    /** QuestionAnswerPrompt question */
    question?: (string|null);

    /** QuestionAnswerPrompt answer */
    answer?: (string|null);

    /** QuestionAnswerPrompt explanation */
    explanation?: (string|null);
}

/** Represents a QuestionAnswerPrompt. */
export class QuestionAnswerPrompt implements IQuestionAnswerPrompt {

    /**
     * Constructs a new QuestionAnswerPrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQuestionAnswerPrompt);

    /** QuestionAnswerPrompt question. */
    public question: string;

    /** QuestionAnswerPrompt answer. */
    public answer: string;

    /** QuestionAnswerPrompt explanation. */
    public explanation: string;

    /**
     * Creates a new QuestionAnswerPrompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QuestionAnswerPrompt instance
     */
    public static create(properties?: IQuestionAnswerPrompt): QuestionAnswerPrompt;

    /**
     * Encodes the specified QuestionAnswerPrompt message. Does not implicitly {@link QuestionAnswerPrompt.verify|verify} messages.
     * @param message QuestionAnswerPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQuestionAnswerPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QuestionAnswerPrompt message, length delimited. Does not implicitly {@link QuestionAnswerPrompt.verify|verify} messages.
     * @param message QuestionAnswerPrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQuestionAnswerPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QuestionAnswerPrompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QuestionAnswerPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QuestionAnswerPrompt;

    /**
     * Decodes a QuestionAnswerPrompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QuestionAnswerPrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QuestionAnswerPrompt;

    /**
     * Verifies a QuestionAnswerPrompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QuestionAnswerPrompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QuestionAnswerPrompt
     */
    public static fromObject(object: { [k: string]: any }): QuestionAnswerPrompt;

    /**
     * Creates a plain object from a QuestionAnswerPrompt message. Also converts values to other types if specified.
     * @param message QuestionAnswerPrompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QuestionAnswerPrompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QuestionAnswerPrompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of a ClozePrompt. */
export interface IClozePrompt {

    /** ClozePrompt body */
    body?: (string|null);
}

/** Represents a ClozePrompt. */
export class ClozePrompt implements IClozePrompt {

    /**
     * Constructs a new ClozePrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IClozePrompt);

    /** ClozePrompt body. */
    public body: string;

    /**
     * Creates a new ClozePrompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns ClozePrompt instance
     */
    public static create(properties?: IClozePrompt): ClozePrompt;

    /**
     * Encodes the specified ClozePrompt message. Does not implicitly {@link ClozePrompt.verify|verify} messages.
     * @param message ClozePrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IClozePrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified ClozePrompt message, length delimited. Does not implicitly {@link ClozePrompt.verify|verify} messages.
     * @param message ClozePrompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IClozePrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a ClozePrompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns ClozePrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): ClozePrompt;

    /**
     * Decodes a ClozePrompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns ClozePrompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): ClozePrompt;

    /**
     * Verifies a ClozePrompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a ClozePrompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns ClozePrompt
     */
    public static fromObject(object: { [k: string]: any }): ClozePrompt;

    /**
     * Creates a plain object from a ClozePrompt message. Also converts values to other types if specified.
     * @param message ClozePrompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: ClozePrompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this ClozePrompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}
