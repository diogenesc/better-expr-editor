package wasmlib

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"syscall/js"

	"expr-lang-editor/formatter"

	"github.com/expr-lang/expr"
)

// FuncDef describes a registered custom function for the expr compiler.
// Metadata (Signature, Detail, Info) is surfaced to the JS editor frontend
// via exprFuncDefs() for autocomplete and hover tooltips.
type FuncDef struct {
	Name      string `json:"name"`
	signature string
	detail    string
	info      string
	fn        any
	types     []any
}

var registry []FuncDef

// Register registers a custom expr function. fn is the Go implementation,
// types is the function signature expressed as new(func(params...) returnType).
// Returns *FuncDef for chaining metadata.
//
//	wasmlib.Register("myFunc", myFuncImpl,
//	    new(func(int) bool),
//	).Signature("myFunc(x int) => bool")
func Register(name string, fn any, types ...any) *FuncDef {
	def := FuncDef{Name: name, fn: fn, types: types}
	registry = append(registry, def)
	return &registry[len(registry)-1]
}

// Signature sets the display signature for autocomplete and hover tooltips.
func (f *FuncDef) Signature(s string) *FuncDef { f.signature = s; return f }

// Detail sets a short description shown in autocomplete listings.
func (f *FuncDef) Detail(d string) *FuncDef { f.detail = d; return f }

// Info sets a longer description shown in hover tooltips.
func (f *FuncDef) Info(i string) *FuncDef { f.info = i; return f }

// Serve registers all JS globals (exprFormat, exprRun, exprCompile,
// exprDisassemble, exprFuncDefs) and blocks forever. Call this from your
// main() in a GOOS=js GOARCH=wasm program.
func Serve() {
	js.Global().Set("exprFormat", js.FuncOf(formatWrapper))
	js.Global().Set("exprRun", js.FuncOf(runWrapper))
	js.Global().Set("exprCompile", js.FuncOf(compileWrapper))
	js.Global().Set("exprDisassemble", js.FuncOf(disasmWrapper))
	js.Global().Set("exprFuncDefs", js.FuncOf(funcDefsWrapper))

	<-make(chan struct{})
}

// --- JS wrappers ---

func formatWrapper(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return errorJSON("missing source argument")
	}
	source := args[0].String()
	result, err := formatter.Format(source)
	if err != nil {
		return errorJSON(err.Error())
	}
	return successJSON(result)
}

func compileWrapper(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return errorJSON("missing source argument")
	}
	source := args[0].String()

	prog, err := expr.Compile(source)
	if err != nil {
		return errorJSON(err.Error())
	}

	return successJSON(prog.Disassemble())
}

func runWrapper(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return errorJSON("missing source argument")
	}
	source := args[0].String()

	var env map[string]any
	if len(args) > 1 && args[1].String() != "" {
		if err := json.Unmarshal([]byte(args[1].String()), &env); err != nil {
			return errorJSON("invalid env json: " + err.Error())
		}
	}

	opts := []expr.Option{expr.Env(env)}
	for _, def := range registry {
		fn, ok := def.fn.(func(params ...any) (any, error))
		if !ok {
			return errorJSON(fmt.Sprintf("function %q must have signature func(params ...any) (any, error)", def.Name))
		}
		opts = append(opts, expr.Function(def.Name, fn, def.types...))
	}

	prog, err := expr.Compile(source, opts...)
	if err != nil {
		return errorJSON(err.Error())
	}

	output, err := expr.Run(prog, env)
	if err != nil {
		return errorJSON(err.Error())
	}

	return successJSON(formatExprValue(output, 0))
}

func disasmWrapper(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return errorJSON("missing source argument")
	}
	source := args[0].String()

	prog, err := expr.Compile(source)
	if err != nil {
		return errorJSON(err.Error())
	}

	return successJSON(prog.Disassemble())
}

func funcDefsWrapper(this js.Value, args []js.Value) any {
	type defJSON struct {
		Name      string `json:"name"`
		Signature string `json:"signature,omitempty"`
		Detail    string `json:"detail,omitempty"`
		Info      string `json:"info,omitempty"`
	}
	list := make([]defJSON, 0)
	for _, r := range registry {
		list = append(list, defJSON{
			Name:      r.Name,
			Signature: r.signature,
			Detail:    r.detail,
			Info:      r.info,
		})
	}
	b, _ := json.Marshal(list)
	return successJSON(string(b))
}

// --- value formatting ---

func formatExprValue(val any, indent int) string {
	pad := strings.Repeat("  ", indent)
	innerPad := strings.Repeat("  ", indent+1)

	switch v := val.(type) {
	case nil:
		return "nil"
	case bool:
		if v {
			return "true"
		}
		return "false"
	case float64:
		if v == float64(int64(v)) {
			return fmt.Sprintf("%d", int64(v))
		}
		return fmt.Sprintf("%v", v)
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	case string:
		return fmt.Sprintf("%q", v)
	case []any:
		if len(v) == 0 {
			return "[]"
		}
		hasComplex := false
		for _, e := range v {
			if _, ok := e.(map[string]any); ok {
				hasComplex = true
				break
			}
			if _, ok := e.([]any); ok {
				hasComplex = true
				break
			}
		}
		if !hasComplex && len(v) <= 3 && indent < 2 {
			var elems []string
			for _, e := range v {
				elems = append(elems, formatExprValue(e, 0))
			}
			return "[" + strings.Join(elems, ", ") + "]"
		}
		var lines []string
		for _, e := range v {
			lines = append(lines, innerPad+formatExprValue(e, indent+1))
		}
		return "[\n" + strings.Join(lines, ",\n") + ",\n" + pad + "]"
	case map[string]any:
		if len(v) == 0 {
			return "{}"
		}
		var keys []string
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		hasComplexVal := false
		for _, k := range keys {
			if _, ok := v[k].(map[string]any); ok {
				hasComplexVal = true
				break
			}
			if _, ok := v[k].([]any); ok {
				hasComplexVal = true
				break
			}
		}
		if !hasComplexVal && len(v) <= 2 && indent < 2 {
			var pairs []string
			for _, k := range keys {
				pairs = append(pairs, formatExprMapKey(k)+": "+formatExprValue(v[k], 0))
			}
			return "{" + strings.Join(pairs, ", ") + "}"
		}
		var lines []string
		for _, k := range keys {
			lines = append(lines, innerPad+formatExprMapKey(k)+": "+formatExprValue(v[k], indent+1))
		}
		return "{\n" + strings.Join(lines, ",\n") + ",\n" + pad + "}"
	default:
		return fmt.Sprintf("%v", v)
	}
}

func formatExprMapKey(k string) string {
	if isIdent(k) {
		return k
	}
	return fmt.Sprintf("%q", k)
}

func isIdent(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		if i == 0 && !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '_') {
			return false
		}
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
			return false
		}
	}
	return true
}

// --- response helpers ---

type rpcResponse struct {
	OK    bool   `json:"ok"`
	Data  string `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

func errorJSON(msg string) string {
	b, _ := json.Marshal(rpcResponse{OK: false, Error: msg})
	return string(b)
}

func successJSON(data string) string {
	b, _ := json.Marshal(rpcResponse{OK: true, Data: data})
	return string(b)
}
