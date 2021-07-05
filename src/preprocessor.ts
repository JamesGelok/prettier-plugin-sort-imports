import { parse as babelParser, ParserOptions } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import { ImportDeclaration, isTSModuleDeclaration } from '@babel/types';

import { getCodeFromAst } from './utils/get-code-from-ast';
import { getSortedNodes } from './utils/get-sorted-nodes';
import { getParserPlugins } from './utils/get-parser-plugins';
import AstPath from './utils/ast-path';
import { PrettierOptions } from './types';

export function preprocessor(code: string, options: PrettierOptions) {
    const {
        importOrder,
        importOrderSeparation,
        parser: prettierParser,
        experimentalBabelParserPluginsList = [],
    } = options;

    const plugins = getParserPlugins(prettierParser);

    const importNodes: ImportDeclaration[] = [];

    const parserOptions: ParserOptions = {
        sourceType: 'module',
        plugins: [...plugins, ...experimentalBabelParserPluginsList],
    };

    const ast = babelParser(code, parserOptions);
    const interpreter = ast.program.interpreter;

    const printer: any = (options as any).printer;
    const prettierInternalAst = new AstPath(printer.preprocess(ast, options));

    traverse(prettierInternalAst.getValue(), {
        ImportDeclaration(path: NodePath<ImportDeclaration>) {
            const isPrettierIgnored = path.node.leadingComments?.some(
                (comment) => {
                    if (comment.value.includes('prettier-ignore')) {
                        const prevPath: NodePath = (path as any).getPrevSibling();
                        if (
                            !prevPath.node &&
                            prevPath.node.trailingComments !== null
                        ) {
                            return true;
                        }

                        if (
                            prevPath.node.trailingComments.find(
                                (sameComment) =>
                                    sameComment.value === comment.value,
                            )
                        ) {
                            console.log('previous node');
                        }
                        // great job that's a comment, does it belong to the previous one?
                        return true;
                    }
                },
            );

            const tsModuleParent = path.findParent((p) =>
                isTSModuleDeclaration(p),
            );

            if (tsModuleParent || isPrettierIgnored) return;

            importNodes.push(path.node);
        },
    });

    // short-circuit if there are no import declaration
    if (importNodes.length === 0) return code;

    const allImports = getSortedNodes(
        importNodes,
        importOrder,
        importOrderSeparation,
    );

    return getCodeFromAst(allImports, code, interpreter);
}
