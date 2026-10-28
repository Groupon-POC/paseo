// Added for Groupon Desk (fork of Paseo, Apache-2.0): an answered question call in the chat's history, the same form with its choices shown and nothing to change.
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  QuestionNav,
  QuestionOptionRow,
  questionFormStyles,
} from "@/components/question-form-card";
import { parseQuestionFormQuestions } from "@/components/question-form-card-core";
import { answeredQuestions, readQuestionAnswers } from "./answered-questions-model";

const ignoreToggle = () => {};

/**
 * The questions a question call asked, as the form showed them, with the options its answer
 * picked: the person browses the questions, and every option is disabled. A call still waiting
 * shows its questions with nothing picked (the live form answers it below the chat).
 */
export function AnsweredQuestions({ input, output }: { input: unknown; output: unknown }) {
  const questions = useMemo(() => parseQuestionFormQuestions(input), [input]);
  const rows = useMemo(
    () => (questions ? answeredQuestions(questions, readQuestionAnswers(output)) : []),
    [questions, output],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const isAnswered = useCallback(
    (index: number) => {
      const row = rows[index];
      return row ? row.selected.size > 0 || row.ownAnswer !== null : false;
    },
    [rows],
  );

  const qIndex = Math.min(activeIndex, rows.length - 1);
  const active = rows[qIndex];
  const ownAnswer = active?.ownAnswer ?? null;
  const ownOption = useMemo(() => (ownAnswer === null ? null : { label: ownAnswer }), [ownAnswer]);
  if (!questions || !active) return null;
  return (
    <View style={[questionFormStyles.container, styles.card]} testID="answered-questions">
      <QuestionNav
        questions={questions}
        activeIndex={qIndex}
        isAnswered={isAnswered}
        isResponding={false}
        onSelect={setActiveIndex}
      />
      <View style={questionFormStyles.questionHeader}>
        <Text style={[questionFormStyles.questionText, styles.questionText]}>
          {active.question.question}
        </Text>
      </View>
      <View style={questionFormStyles.questionBlock}>
        <View style={questionFormStyles.optionsWrap}>
          {active.question.options.map((option, optIndex) => (
            <QuestionOptionRow
              key={option.label}
              qIndex={qIndex}
              optIndex={optIndex}
              option={option}
              isSelected={active.selected.has(optIndex)}
              multiSelect={active.question.multiSelect}
              isResponding
              onToggle={ignoreToggle}
            />
          ))}
          {ownOption ? (
            <QuestionOptionRow
              qIndex={qIndex}
              optIndex={active.question.options.length}
              option={ownOption}
              isSelected
              multiSelect={active.question.multiSelect}
              isResponding
              onToggle={ignoreToggle}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
  },
  questionText: {
    color: theme.colors.foreground,
  },
}));
