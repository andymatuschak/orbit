import { Link, Logo, styles, useLayout } from "metabook-ui";
import DebugGrid from "metabook-ui/dist/styles/DebugGrid";
import { edgeMargin } from "metabook-ui/dist/styles/layout";
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
        styles.type.label.layoutStyle,
        {
          color: styles.colors.white,
        },
      ]}
    >
      Orbit is an experimental system that helps you engage with ideas more
      deeply by returning to them over time.
    </Text>
  );
}

function Contents() {
  return (
    <>
      <Heading>Making memory a&nbsp;choice</Heading>
      <Paragraph>
        It’s disconcerting how quickly we forget much of what we read. That may
        not matter much when we’re reading for fun, but it’s hard to understand
        complex ideas—or to build on them ourselves—while constantly flipping
        back a few pages to reinforce a fuzzy detail.
      </Paragraph>
      <Paragraph>
        This lossiness might seem like an immutable fact of life, but cognitive
        scientists have understood how to guarantee you’ll remember something
        permanently. Orbit lets authors build those ideas into their work,
        making it easy for people to remember what they read.
      </Paragraph>
      <Paragraph>
        As you read, you’ll occasionally answer a few simple questions which
        reinforce the ideas you’ve just seen. Those memories will fade, so after
        a few days, we’ll send you an email inviting you to quickly review the
        text’s questions. If you still remember an answer, you’ll next see it
        two weeks later. Then a month after that, then two months, and so on, in
        an expanding schedule. If you forget an answer, the review schedule
        contracts to reinforce that question.
      </Paragraph>
      <Paragraph>
        The exponentially expanding schedule means that you need just a few
        reviews (typically a few seconds each) to remember an answer for years.
        Memory is typically haphazard—we read something interesting and hope
        we’ll remember it—but this review strategy guarantees you’ll remember.
        By integrating these ideas into texts, Orbit creates a new{" "}
        <em>mnemonic medium</em> which makes memory a choice.
      </Paragraph>
      <Heading>Bringing ideas into your orbit</Heading>
      <Paragraph>
        You may have used flashcards like these to memorize simple facts like
        vocabulary words or anatomy. When done well, that can automate away
        learning the “easy part” of a subject so you can focus on deeper, more
        conceptual issues. But one of the ideas motivating Orbit is that these
        review techniques can also directly help people master abstract,
        conceptual knowledge.
      </Paragraph>
      <Paragraph>
        A text’s questions need not ask only for definitions: they can ask about
        connections, implications, causes, and consequences. They can prompt you
        to reflect or to synthesize something new. And by weaving these
        questions into a narrative, authors can situate them in rich context,
        breaking the ordinary constraints of flashcards as a medium.
      </Paragraph>
      <Paragraph>
        When you read a text that’s written with Orbit, you don’t just read it
        once and then proceed with your life. The review sessions keep you in
        contact with the ideas over time, returning you to the material again
        and again over weeks and months. The ongoing practice changes your
        relationship to what you read. It gives you a way to bring ideas into
        your orbit.
      </Paragraph>
      <Paragraph>
        Orbit’s a new platform—and very much an experiment. But ultimately, the
        aspiration is that you won’t just use prompts that others have written:
        you’ll write your own, not just representing others’ ideas but also your
        own. When something seems interesting, you can tie a string to it and
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
        continuing a series of projects with collaborator{" "}
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
            by Michael Nielsen, explores the spaced repetition mechanic in much
            more detail.
          </li>
        </ul>
      </Paragraph>
      <Paragraph>
        Orbit is a free service;{" "}
        <Link href="https://patreon.com/quantumcountry">
          my Patreon community
        </Link>{" "}
        helps it stay that way. If you find this work interesting, you can
        become a member to read regular patron-only articles and previews of
        upcoming projects.
      </Paragraph>
      <Paragraph>
        If you’re an author interested in using Orbit in your own texts, please{" "}
        <Link href="mailto:andy@andymatuschak.org">contact me</Link>.
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
        {/*<DebugGrid />*/}
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

function SmallLayout({ width }: { width: number }) {
  return (
    <View style={{ padding: edgeMargin }}>
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
          {size === "large" ? (
            <LargeLayout width={width} />
          ) : (
            <SmallLayout width={width} />
          )}
        </SizeContext.Provider>
      )}
    </View>
  );
}
