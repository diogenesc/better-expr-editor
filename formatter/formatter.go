package formatter

import (
	"fmt"
	"strings"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
)

const lineWidth = 60

func Format(input string) (string, error) {
	tree, err := parser.Parse(input)
	if err != nil {
		return "", err
	}
	f := &formatter{indent: 0}
	f.format(tree.Node)
	out := strings.TrimSpace(f.buf.String())
	return out, nil
}

type formatter struct {
	buf             strings.Builder
	indent          int
	queue           []string
	suppressPointer bool
}

func (f *formatter) write(s string) {
	f.buf.WriteString(s)
}

func (f *formatter) newline() {
	f.buf.WriteByte('\n')
	for range f.indent {
		f.buf.WriteString("  ")
	}
}

func (f *formatter) maybeNewline() {
	f.newline()
}

func (f *formatter) format(node ast.Node) {
	switch n := node.(type) {
	case *ast.NilNode:
		f.write("nil")
	case *ast.IntegerNode:
		fmt.Fprintf(&f.buf, "%d", n.Value)
	case *ast.FloatNode:
		fmt.Fprintf(&f.buf, "%v", n.Value)
	case *ast.BoolNode:
		if n.Value {
			f.write("true")
		} else {
			f.write("false")
		}
	case *ast.StringNode:
		fmt.Fprintf(&f.buf, "%q", n.Value)
	case *ast.BytesNode:
		fmt.Fprintf(&f.buf, "b%q", string(n.Value))
	case *ast.IdentifierNode:
		f.write(n.Value)
	case *ast.ConstantNode:
		f.write(fmt.Sprintf("%v", n.Value))
	case *ast.UnaryNode:
		f.formatUnary(n)
	case *ast.BinaryNode:
		f.formatBinary(n)
	case *ast.ChainNode:
		f.format(n.Node)
	case *ast.MemberNode:
		f.formatMember(n)
	case *ast.SliceNode:
		f.formatSlice(n)
	case *ast.CallNode:
		f.formatCall(n)
	case *ast.BuiltinNode:
		f.formatBuiltin(n)
	case *ast.PredicateNode:
		f.formatPredicate(n)
	case *ast.PointerNode:
		if n.Name == "" {
			f.write("#")
		} else {
			f.write("#" + n.Name)
		}
	case *ast.ConditionalNode:
		f.formatConditional(n)
	case *ast.ArrayNode:
		f.formatArray(n)
	case *ast.MapNode:
		f.formatMap(n)
	case *ast.PairNode:
		f.formatPair(n)
	case *ast.SequenceNode:
		f.formatSequence(n)
	case *ast.VariableDeclaratorNode:
		f.formatVariableDecl(n)
	default:
		f.write(fmt.Sprintf("%v", n))
	}
}

func (f *formatter) formatUnary(n *ast.UnaryNode) {
	switch n.Operator {
	case "not":
		f.write("not ")
		f.format(n.Node)
	default:
		f.write(n.Operator)
		f.format(n.Node)
	}
}

func (f *formatter) formatBinary(n *ast.BinaryNode) {
	if n.Operator == "|" {
		f.formatPipeChain(n)
		return
	}

	if isLogicalOp(n.Operator) {
		f.formatLogicalChain(n)
		return
	}

	f.format(n.Left)
	if n.Operator == ".." {
		f.write(n.Operator)
	} else {
		f.write(" ")
		f.write(n.Operator)
		f.write(" ")
	}
	f.format(n.Right)
}

func isLogicalOp(op string) bool {
	return op == "and" || op == "or" || op == "&&" || op == "||"
}

func (f *formatter) formatPipeChain(n *ast.BinaryNode) {
	var parts []ast.Node
	collectPipeParts(n, &parts)

	for i, part := range parts {
		if i == 0 {
			f.format(part)
		} else {
			f.newline()
			f.write("  | ")
			f.format(part)
		}
	}
}

func collectPipeParts(n *ast.BinaryNode, parts *[]ast.Node) {
	if left, ok := n.Left.(*ast.BinaryNode); ok && left.Operator == "|" {
		collectPipeParts(left, parts)
	} else {
		*parts = append(*parts, n.Left)
	}
	*parts = append(*parts, n.Right)
}

func (f *formatter) formatLogicalChain(n *ast.BinaryNode) {
	var parts []logicalPart
	collectLogicalParts(n, &parts)

	oneLine := len(parts) <= 2
	if !oneLine {
		cf := &formatter{indent: f.indent}
		cf.write("(")
		for i, p := range parts {
			if i > 0 {
				cf.write(" ")
				cf.write(p.op)
				cf.write(" ")
			}
			cf.format(p.node)
		}
		cf.write(")")
		oneLine = cf.buf.Len()-2 < lineWidth
	}

	if oneLine {
		for i, p := range parts {
			if i > 0 {
				f.write(" ")
				f.write(p.op)
				f.write(" ")
			}
			f.format(p.node)
		}
		return
	}

	for i, p := range parts {
		if i == 0 {
			f.format(p.node)
		} else {
			f.newline()
			f.write(p.op)
			f.write(" ")
			f.format(p.node)
		}
	}
}

type logicalPart struct {
	node ast.Node
	op   string
}

func collectLogicalParts(n *ast.BinaryNode, parts *[]logicalPart) {
	if left, ok := n.Left.(*ast.BinaryNode); ok && left.Operator == n.Operator {
		collectLogicalParts(left, parts)
	} else {
		*parts = append(*parts, logicalPart{node: n.Left, op: n.Operator})
	}
	*parts = append(*parts, logicalPart{node: n.Right, op: n.Operator})
}

func (f *formatter) formatMember(n *ast.MemberNode) {
	if ptr, ok := n.Node.(*ast.PointerNode); ok && ptr.Name == "" && f.suppressPointer {
		// skip implicit # - just format the property access
	} else {
		f.format(n.Node)
	}
	if prop, ok := n.Property.(*ast.StringNode); ok && isIdent(prop.Value) {
		if n.Optional {
			f.write("?.")
		} else {
			f.write(".")
		}
		f.write(prop.Value)
	} else {
		if n.Optional {
			f.write("?.[")
		} else {
			f.write("[")
		}
		f.format(n.Property)
		f.write("]")
	}

}

func isIdent(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if i == 0 && !isAlpha(r) && r != '_' {
			return false
		}
		if !isAlpha(r) && !isDigit(r) && r != '_' {
			return false
		}
	}
	return true
}

func isAlpha(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func isDigit(r rune) bool {
	return r >= '0' && r <= '9'
}

func (f *formatter) formatSlice(n *ast.SliceNode) {
	f.format(n.Node)
	f.write("[")
	if n.From != nil {
		f.format(n.From)
	}
	f.write(":")
	if n.To != nil {
		f.format(n.To)
	}
	f.write("]")
}

func (f *formatter) formatCall(n *ast.CallNode) {
	f.format(n.Callee)
	f.write("(")
	for i, arg := range n.Arguments {
		if i > 0 {
			f.write(", ")
		}
		f.format(arg)
	}
	f.write(")")
}

func (f *formatter) formatBuiltin(n *ast.BuiltinNode) {
	if len(n.Arguments) > 0 {
		source, steps := collectBuiltinPipeChain(n)
		if len(steps) >= 2 {
			f.formatBuiltinPipeChain(source, steps)
			return
		}
	}

	f.write(n.Name)
	f.write("(")
	hasPredicate := false
	for i, arg := range n.Arguments {
		if i > 0 {
			f.write(", ")
		}

		if i == 1 && len(n.Arguments) == 2 {
			if _, ok := arg.(*ast.PredicateNode); ok {
				hasPredicate = true
			}
		}

		if i == 1 && len(n.Arguments) == 2 {
			if pred, ok := arg.(*ast.PredicateNode); ok {
				f.formatPredicateArg(pred)
				continue
			}
		}

		f.format(arg)
	}

	if n.Map != nil {
		if hasPredicate {
			f.write(", ")
		}
		f.format(n.Map)
	}
	f.write(")")
}

type pipeStep struct {
	name string
	args []ast.Node
}

func collectBuiltinPipeChain(n *ast.BuiltinNode) (ast.Node, []pipeStep) {
	var outerSteps []pipeStep
	cur := n
	for {
		if len(cur.Arguments) > 0 {
			if next, ok := cur.Arguments[0].(*ast.BuiltinNode); ok {
				var args []ast.Node
				if len(cur.Arguments) > 1 {
					args = cur.Arguments[1:]
				}
				if cur.Map != nil {
					args = append(args, cur.Map)
				}
				outerSteps = append(outerSteps, pipeStep{name: cur.Name, args: args})
				cur = next
				continue
			}
		}
		break
	}

	// No pipe nesting found — first arg not a BuiltinNode
	if len(outerSteps) == 0 {
		return nil, nil
	}

	// cur is the innermost BuiltinNode; its args[0] is the source
	if len(cur.Arguments) < 1 {
		return nil, nil
	}

	source := cur.Arguments[0]
	var innerArgs []ast.Node
	if len(cur.Arguments) > 1 {
		innerArgs = cur.Arguments[1:]
	}
	if cur.Map != nil {
		innerArgs = append(innerArgs, cur.Map)
	}

	// Build steps in pipe order: innermost first, then outerSteps reversed
	steps := []pipeStep{{name: cur.Name, args: innerArgs}}
	for i := len(outerSteps) - 1; i >= 0; i-- {
		steps = append(steps, outerSteps[i])
	}

	return source, steps
}

func (f *formatter) formatBuiltinPipeChain(source ast.Node, steps []pipeStep) {
	f.format(source)
	for _, step := range steps {
		f.newline()
		f.write("  | ")
		f.write(step.name)
		f.write("(")
		for i, arg := range step.args {
			if i > 0 {
				f.write(", ")
			}
			if pred, ok := arg.(*ast.PredicateNode); ok {
				f.formatPredicate(pred)
			} else {
				f.format(arg)
			}
		}
		f.write(")")
	}
}

func (f *formatter) formatPredicateArg(n *ast.PredicateNode) {
	// Predicate body that is a function call: omit {} — rendered as bare call
	if _, ok := n.Node.(*ast.BuiltinNode); ok {
		f.format(n.Node)
		return
	}
	if _, ok := n.Node.(*ast.CallNode); ok {
		f.format(n.Node)
		return
	}

	cf := &formatter{indent: f.indent + 1, suppressPointer: true}
	cf.format(n.Node)
	body := strings.TrimSpace(cf.buf.String())

	onOneLine := len(body) < lineWidth && !strings.Contains(body, "\n")

	if onOneLine {
		f.write("{")
		f.write(body)
		f.write("}")
	} else {
		f.write("{\n")
		f.indent++
		f.format(n.Node)
		f.indent--
		f.newline()
		f.write("}")
	}
}

func (f *formatter) formatPredicate(n *ast.PredicateNode) {
	old := f.suppressPointer
	f.suppressPointer = true
	f.format(n.Node)
	f.suppressPointer = old
}

func (f *formatter) formatConditional(n *ast.ConditionalNode) {
	if n.Ternary {
		f.format(n.Cond)
		f.write(" ? ")
		f.format(n.Exp1)
		f.write(" : ")
		f.format(n.Exp2)
	} else {
		f.write("if ")
		f.format(n.Cond)
		f.write(" {")
		f.indent++
		f.newline()
		f.format(n.Exp1)
		f.indent--
		f.newline()
		f.write("} else {")
		f.indent++
		f.newline()
		f.format(n.Exp2)
		f.indent--
		f.newline()
		f.write("}")
	}
}

func (f *formatter) formatArray(n *ast.ArrayNode) {
	if len(n.Nodes) == 0 {
		f.write("[]")
		return
	}

	onOneLine := len(n.Nodes) <= 3
	if onOneLine {
		var sub strings.Builder
		for i, elem := range n.Nodes {
			if i > 0 {
				sub.WriteString(", ")
			}
			cf2 := &formatter{}
			cf2.format(elem)
			sub.WriteString(strings.TrimSpace(cf2.buf.String()))
		}
		onOneLine = sub.Len() < lineWidth && !strings.Contains(sub.String(), "\n")
		if onOneLine {
			f.write("[")
			f.write(sub.String())
			f.write("]")
			return
		}
	}

	f.write("[")
	f.indent++
	for i, elem := range n.Nodes {
		f.newline()
		f.format(elem)
		if i < len(n.Nodes)-1 {
			f.write(",")
		}
	}
	f.write("\n")
	f.indent--
	for range f.indent {
		f.write("  ")
	}
	f.write("]")
}

func (f *formatter) formatMap(n *ast.MapNode) {
	if len(n.Pairs) == 0 {
		f.write("{}")
		return
	}

	if len(n.Pairs) == 1 {
		f.write("{")
		f.format(n.Pairs[0])
		f.write("}")
		return
	}

	if len(n.Pairs) <= 2 {
		var sub strings.Builder
		for i, p := range n.Pairs {
			if i > 0 {
				sub.WriteString(", ")
			}
			pair := p.(*ast.PairNode)
			sub.WriteString(formatMapKey(pair.Key))
			sub.WriteString(": ")
			cf := &formatter{}
			cf.format(pair.Value)
			sub.WriteString(strings.TrimSpace(cf.buf.String()))
		}
		if sub.Len() < lineWidth {
			f.write("{")
			f.write(sub.String())
			f.write("}")
			return
		}
	}

	f.write("{")
	f.indent++
	for i, p := range n.Pairs {
		f.newline()
		f.format(p)
		if i < len(n.Pairs)-1 {
			f.write(",")
		}
	}
	f.write("\n")
	f.indent--
	for range f.indent {
		f.write("  ")
	}
	f.write("}")
}

func formatMapKey(key ast.Node) string {
	switch k := key.(type) {
	case *ast.StringNode:
		if isIdent(k.Value) {
			return k.Value
		}
		return fmt.Sprintf("%q", k.Value)
	case *ast.IdentifierNode:
		return k.Value
	default:
		cf := &formatter{}
		cf.format(k)
		return strings.TrimSpace(cf.buf.String())
	}
}

func (f *formatter) formatPair(n *ast.PairNode) {
	f.write(formatMapKey(n.Key))
	f.write(": ")
	f.format(n.Value)
}

func (f *formatter) formatSequence(n *ast.SequenceNode) {
	for i, node := range n.Nodes {
		if i > 0 {
			f.write(";\n")
		}
		f.format(node)
	}
}

func (f *formatter) formatVariableDecl(n *ast.VariableDeclaratorNode) {
	f.write("let ")
	f.write(n.Name)
	f.write(" = ")
	f.format(n.Value)
	f.write(";\n")
	if n.Expr != nil {
		f.format(n.Expr)
	}
}
