package formatter

import (
	"strings"
	"testing"
)

func requireEqual(t *testing.T, expected, actual string) {
	t.Helper()
	if expected != actual {
		t.Errorf("\nexpected:\n%s\n\ngot:\n%s", expected, actual)
	}
}

func requireNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func requireNotEmpty(t *testing.T, s string) {
	t.Helper()
	if s == "" {
		t.Fatal("expected non-empty string")
	}
}

func requireContains(t *testing.T, s, substr string) {
	t.Helper()
	if !strings.Contains(s, substr) {
		t.Errorf("expected %q to contain %q", s, substr)
	}
}

func requireError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func requireTrue(t *testing.T, v bool, msg string) {
	t.Helper()
	if !v {
		t.Fatal(msg)
	}
}

func TestFormatPipeChain(t *testing.T) {
	input := `1..9 | filter(# % 2 == 0) | map(# ^ 2)`
	expected := `1..9
  | filter(# % 2 == 0)
  | map(# ^ 2)`
	output, err := Format(input)
	requireNoError(t, err)
	requireEqual(t, expected, output)
}

func TestFormatSingleLineUnchanged(t *testing.T) {
	input := `2 + 2`
	output, err := Format(input)
	requireNoError(t, err)
	requireEqual(t, input, output)
}

func TestFormatNestedPipeChain(t *testing.T) {
	input := `users | filter(.age > 18) | map(.name) | sort() | join(", ")`
	expected := `users
  | filter(.age > 18)
  | map(.name)
  | sort()
  | join(", ")`
	output, err := Format(input)
	requireNoError(t, err)
	requireEqual(t, expected, output)
}

func TestFormatLogicalChain(t *testing.T) {
	input := `user.age > 18 and user.name startsWith "J" or user.isAdmin`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "and")
	requireContains(t, output, "or")
}

func TestFormatSequence(t *testing.T) {
	input := `let x = 42; let y = 2; x * y`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "let x = 42")
	requireContains(t, output, "let y = 2")
	requireContains(t, output, "x * y")
}

func TestFormatEmptyInput(t *testing.T) {
	_, err := Format("")
	requireError(t, err)
}

func TestFormatMap(t *testing.T) {
	input := `{foo: 1, bar: 2}`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "foo")
	requireContains(t, output, "bar")
}

func TestFormatArray(t *testing.T) {
	input := `[1, 2, 3]`
	output, err := Format(input)
	requireNoError(t, err)
	requireEqual(t, input, output)
}

func TestFormatTernary(t *testing.T) {
	input := `true ? "yes" : "no"`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "?")
	requireContains(t, output, ":")
}

func TestFormatUnary(t *testing.T) {
	input := `not (x > 0)`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "not")
}

func TestFormatBytes(t *testing.T) {
	input := `b"hello"`
	output, err := Format(input)
	requireNoError(t, err)
	requireEqual(t, input, output)
}

func TestFormatRealWorldExample1(t *testing.T) {
	input := `let x = 42; 1..100 | map(# * 2) | filter(# > 50) | sum()`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "|")
	requireContains(t, output, "let")
	lines := strings.Split(output, "\n")
	requireTrue(t, len(lines) > 2, "should be multi-line for complex expression")
}

func TestFormatCompareExample(t *testing.T) {
	input := `user.Group in ["admin", "moderator"] || user.Id == comment.UserId`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "||")
}

func TestFormatTimeExample(t *testing.T) {
	input := `request.Time - resource.Age < duration("24h")`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "duration")
}

func TestFormatAllTweetExample(t *testing.T) {
	input := `all(tweets, len(.Content) <= 240)`
	output, err := Format(input)
	requireNoError(t, err)
	requireContains(t, output, "all")
	requireContains(t, output, "len")
}
