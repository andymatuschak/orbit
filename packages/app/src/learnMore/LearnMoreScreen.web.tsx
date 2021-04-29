import { Link, Logo, styles, useLayout } from "@withorbit/ui";
import React, { ReactNode } from "react";
import { StyleSheet, Image, Text, View } from "react-native";

const localStyles = StyleSheet.create({
  headingLargeSize: {
    marginTop: styles.layout.gridUnit * 6,
    marginBottom: styles.layout.gridUnit * 2,
  },
  headingSmallSize: {
    marginTop: styles.layout.gridUnit * 3,
    marginBottom: styles.layout.gridUnit * 2,
  },
  paragraph: {
    marginBottom: styles.layout.gridUnit * 2,
  },
});

const SizeContext = React.createContext<"large" | "small">("large");

function Heading({ children }: { children: ReactNode }) {
  const size = React.useContext(SizeContext);
  return (
    <Text
      style={[
        styles.type.headline.layoutStyle,
        size === "large"
          ? localStyles.headingLargeSize
          : localStyles.headingSmallSize,
      ]}
    >
      {children}
    </Text>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  const size = React.useContext(SizeContext);
  return (
    <Text
      style={[
        size === "large"
          ? styles.type.runningText.layoutStyle
          : styles.type.runningTextSmall.layoutStyle,
        localStyles.paragraph,
      ]}
    >
      {children}
    </Text>
  );
}

function Summary() {
  return (
    <Text
      style={[
        styles.type.headline.layoutStyle,
        {
          color: styles.colors.white,
        },
      ]}
    >
      Orbit helps you deeply internalize ideas through periodic review.
    </Text>
  );
}

function Contents() {
  return (
    <>
      <Heading>Orbit makes memory a&nbsp;choice</Heading>
      <Paragraph>
        It’s frustrating how quickly we forget much of what we read. We may not
        care when we&rsquo;re just reading for fun. But it&rsquo;s hard to make
        sense of complex ideas when they build on earlier details we&rsquo;ve
        already begun to forget. Often we take away a vague gist instead of
        accurate understanding.
      </Paragraph>
      <Paragraph>
        Happily, cognitive scientists have developed simple strategies which can
        ensure you&rsquo;ll remember something permanently. Orbit lets authors
        build those techniques into their writing, making it easy for you to
        remember what you&rsquo;ve read.
      </Paragraph>
      <Paragraph>
        As you read, Orbit occasionally prompts you with quick questions to
        reinforce the ideas you’ve just seen. Memory fades, so after a few days,
        Orbit will send you an email inviting you to quickly review the text’s
        questions. If you still remember an answer, you’ll next see it two weeks
        later. Then a month after that, then two months, and so on. If you
        forget an answer, the schedule contracts to reinforce that question.
      </Paragraph>
      <Paragraph>
        The expanding schedule means that you need just a few reviews (usually a
        few seconds each) to remember an answer for years. Memory is typically
        haphazard—we read something interesting and hope we’ll remember it—but
        this review system <em>makes memory a choice</em>.
      </Paragraph>
      <Heading>Bringing ideas into your orbit</Heading>
      <Paragraph>
        You may have made flashcards in school to memorize facts like vocabulary
        words or anatomy. When used well, simple flashcards can automate away
        learning the “easy part” of a subject so you can focus on deeper, more
        conceptual issues. But one of the ideas motivating Orbit is that these
        review techniques can also directly help people master abstract,
        conceptual knowledge.
      </Paragraph>
      <Paragraph>
        Orbit questions can go beyond facts to probe connections, implications,
        causes, and consequences. They can prompt you to reflect or to
        synthesize something new. And by weaving these questions into a
        narrative, authors can situate them in a rich context, breaking the
        ordinary constraints of flashcards as a medium.
      </Paragraph>
      <Paragraph>
        When you read a text that’s written with Orbit, you don’t just read it
        once and then set it aside, perhaps forever. The review sessions keep
        you in contact with the ideas, returning you to the material again and
        again over weeks and months. The ongoing practice changes your
        relationship to what you read. It gives you a way to{" "}
        <em>bring ideas into your orbit.</em>
      </Paragraph>
      <Paragraph>
        Orbit’s a new platform—and very much an experiment. Future versions will
        enable you to write your own prompts, keeping you in touch with your own
        ideas. When something seems interesting, you can tie a string to it and
        throw it up in a lazy arc. It’ll swing back around at some point, but
        you’re not terribly concerned with when. You’ll give its string more or
        less slack over time. Floating above your head, then, is an
        ever-shifting constellation of inklings, facts, questions, prompts,
        obsessions. Every day you stare up at the slice of sky above you and
        respond to what’s there.
      </Paragraph>
      <Heading>More about the project</Heading>
      <Paragraph>
        Orbit is a project by{" "}
        <Link href={"https://andymatuschak.org"}>Andy Matuschak</Link>,
        continuing a series of projects co-authored with{" "}
        <Link href={"http://michaelnielsen.org"}>Michael Nielsen</Link>. For
        more background:
        <ul style={{ marginTop: styles.layout.gridUnit * 2, marginBottom: 0 }}>
          <li>
            <Link href={"https://quantum.country"}>
              <em>Quantum Country</em>
            </Link>{" "}
            was our prototype mnemonic medium, a textbook on quantum computing.
            Hundreds of readers have durably memorized this textbook.
          </li>
          <li>
            <Link href={"https://numinous.productions/ttft"}>
              <em>How can we build transformative tools for thought?</em>
            </Link>{" "}
            expands on the theories behind the mnemonic medium and reports some
            early findings from Quantum Country.
          </li>
          <li>
            <Link href={"https://numinous.productions/timeful"}>
              <em>Timeful texts</em>
            </Link>{" "}
            describes how this mechanism might be used to extend reading
            experiences in time.
          </li>
          <li>
            <Link href={"http://augmentingcognition.com/ltm.html"}>
              <em>Augmenting long-term memory</em>
            </Link>{" "}
            (by Michael Nielsen) explores the spaced repetition mechanic in much
            more detail.
          </li>
        </ul>
      </Paragraph>
      <Paragraph>
        Orbit is a free service;{" "}
        <Link href="https://patreon.com/quantumcountry">
          my Patreon community
        </Link>{" "}
        helps it stay that way. You can become a member to support the work, and
        to read regular patron-only articles and previews of upcoming projects.
      </Paragraph>
      <Paragraph>
        If you’re an author interested in using Orbit in your own texts, please{" "}
        <Link href="https://docs.withorbit.com">
          view the preliminary documentation
        </Link>
        .
      </Paragraph>
    </>
  );
}

function LargeLayout({ width }: { width: number }) {
  const innerWidth = Math.min(width, 1400);
  const sidebarSize = (innerWidth - outerPadding * 2) / 2;
  const starburstSize = Math.min(sidebarSize, window.innerHeight);
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        maxWidth: 1400,
        marginLeft: "auto",
        marginRight: "auto",
        paddingLeft: outerPadding,
        paddingRight: outerPadding,
      }}
    >
      <View
        style={{
          flex: 1,
          position: "relative",
        }}
      >
        <View
          /* @ts-ignore RN types don't know about position fixed. */
          style={{
            position: "fixed",
            height: "100vh",
            width: sidebarSize,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: outerPadding,
            }}
          >
            <Logo units={4} tintColor={styles.colors.ink} />
          </View>
          <Image
            source={require("../../assets/learnMore/starburst.svg")}
            style={{
              width: starburstSize - outerPadding,
              height: starburstSize - outerPadding,
              transform: [{ translateX: -outerPadding / 2 }],
              maxWidth: 500,
              maxHeight: 500,
              margin: "auto",
            }}
          />
        </View>
      </View>
      <View
        style={{
          flex: 1,
          paddingTop: outerPadding,
          paddingBottom: outerPadding,
        }}
      >
        <View
          style={{
            maxWidth: 450,
            marginTop: styles.layout.gridUnit * 10,
            marginBottom: styles.layout.gridUnit * 2,
          }}
        >
          <Summary />
        </View>
        <Contents />
      </View>
    </View>
  );
}

function SmallLayout() {
  return (
    <View style={{ padding: styles.layout.edgeMargin }}>
      <View
        style={{
          position: "absolute",
        }}
      >
        <Logo units={4} tintColor={styles.colors.ink} />
      </View>
      <Image
        source={require("../../assets/learnMore/starburst-red.svg")}
        style={{
          position: "absolute",
          top: -40,
          right: -50,
          width: 350,
          height: 350,
          maxWidth: 500,
          maxHeight: 500,
          margin: "auto",
        }}
      />
      <View
        style={{
          maxWidth: 500,
        }}
      >
        {/*<DebugGrid />*/}
        <View
          style={{
            maxWidth: 450,
            marginTop: styles.layout.gridUnit * 30,
            marginBottom: styles.layout.gridUnit * 2,
          }}
        >
          <Summary />
        </View>
        <Contents />
      </View>
    </View>
  );
}

const outerPadding = styles.layout.gridUnit * 4;
const palette = styles.colors.palettes.orange;

export default function LearnMoreScreenWeb() {
  const { width, onLayout } = useLayout();
  let size: "large" | "small" | null;
  if (width >= 900) {
    size = "large";
  } else if (width > 0) {
    size = "small";
  } else {
    size = null;
  }

  return (
    <View
      style={{
        backgroundColor: palette.backgroundColor,
        flex: 1,
        width: "100vw",
        overflow: "hidden",
      }}
      onLayout={onLayout}
    >
      {size && (
        <SizeContext.Provider value={size}>
          {size === "large" ? <LargeLayout width={width} /> : <SmallLayout />}
        </SizeContext.Provider>
      )}
    </View>
  );
}
