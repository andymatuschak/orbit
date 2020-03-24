import * as $protobuf from "protobufjs";
/** Properties of a Prompt. */
export interface IPrompt {

    /** Prompt basicPrompt */
    basicPrompt?: (IQuestionAnswer|null);

    /** Prompt applicationPrompt */
    applicationPrompt?: (IApplicationPrompt|null);
}

/** Represents a Prompt. */
export class Prompt implements IPrompt {

    /**
     * Constructs a new Prompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IPrompt);

    /** Prompt basicPrompt. */
    public basicPrompt?: (IQuestionAnswer|null);

    /** Prompt applicationPrompt. */
    public applicationPrompt?: (IApplicationPrompt|null);

    /** Prompt prompt. */
    public prompt?: ("basicPrompt"|"applicationPrompt");

    /**
     * Creates a new Prompt instance using the specified properties.
     * @param [properties] Properties to set
     * @returns Prompt instance
     */
    public static create(properties?: IPrompt): Prompt;

    /**
     * Encodes the specified Prompt message. Does not implicitly {@link Prompt.verify|verify} messages.
     * @param message Prompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified Prompt message, length delimited. Does not implicitly {@link Prompt.verify|verify} messages.
     * @param message Prompt message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IPrompt, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Prompt message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Prompt;

    /**
     * Decodes a Prompt message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns Prompt
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): Prompt;

    /**
     * Verifies a Prompt message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a Prompt message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns Prompt
     */
    public static fromObject(object: { [k: string]: any }): Prompt;

    /**
     * Creates a plain object from a Prompt message. Also converts values to other types if specified.
     * @param message Prompt
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: Prompt, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Prompt to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

/** Properties of an ApplicationPrompt. */
export interface IApplicationPrompt {

    /** ApplicationPrompt variants */
    variants?: (IQuestionAnswer[]|null);
}

/** Represents an ApplicationPrompt. */
export class ApplicationPrompt implements IApplicationPrompt {

    /**
     * Constructs a new ApplicationPrompt.
     * @param [properties] Properties to set
     */
    constructor(properties?: IApplicationPrompt);

    /** ApplicationPrompt variants. */
    public variants: IQuestionAnswer[];

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

/** Properties of a QuestionAnswer. */
export interface IQuestionAnswer {

    /** QuestionAnswer version */
    version?: (number|null);

    /** QuestionAnswer question */
    question?: (string|null);

    /** QuestionAnswer answer */
    answer?: (string|null);

    /** QuestionAnswer explanation */
    explanation?: (string|null);
}

/** Represents a QuestionAnswer. */
export class QuestionAnswer implements IQuestionAnswer {

    /**
     * Constructs a new QuestionAnswer.
     * @param [properties] Properties to set
     */
    constructor(properties?: IQuestionAnswer);

    /** QuestionAnswer version. */
    public version: number;

    /** QuestionAnswer question. */
    public question: string;

    /** QuestionAnswer answer. */
    public answer: string;

    /** QuestionAnswer explanation. */
    public explanation: string;

    /**
     * Creates a new QuestionAnswer instance using the specified properties.
     * @param [properties] Properties to set
     * @returns QuestionAnswer instance
     */
    public static create(properties?: IQuestionAnswer): QuestionAnswer;

    /**
     * Encodes the specified QuestionAnswer message. Does not implicitly {@link QuestionAnswer.verify|verify} messages.
     * @param message QuestionAnswer message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IQuestionAnswer, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Encodes the specified QuestionAnswer message, length delimited. Does not implicitly {@link QuestionAnswer.verify|verify} messages.
     * @param message QuestionAnswer message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encodeDelimited(message: IQuestionAnswer, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a QuestionAnswer message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns QuestionAnswer
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): QuestionAnswer;

    /**
     * Decodes a QuestionAnswer message from the specified reader or buffer, length delimited.
     * @param reader Reader or buffer to decode from
     * @returns QuestionAnswer
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): QuestionAnswer;

    /**
     * Verifies a QuestionAnswer message.
     * @param message Plain object to verify
     * @returns `null` if valid, otherwise the reason why it is not
     */
    public static verify(message: { [k: string]: any }): (string|null);

    /**
     * Creates a QuestionAnswer message from a plain object. Also converts values to their respective internal types.
     * @param object Plain object
     * @returns QuestionAnswer
     */
    public static fromObject(object: { [k: string]: any }): QuestionAnswer;

    /**
     * Creates a plain object from a QuestionAnswer message. Also converts values to other types if specified.
     * @param message QuestionAnswer
     * @param [options] Conversion options
     * @returns Plain object
     */
    public static toObject(message: QuestionAnswer, options?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this QuestionAnswer to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}
