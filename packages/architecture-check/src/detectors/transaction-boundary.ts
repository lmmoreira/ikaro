import { CallExpression, Node, SyntaxKind } from 'ts-morph';

function isFunctionBoundary(node: Node): boolean {
  return [
    SyntaxKind.ArrowFunction,
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.FunctionExpression,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.GetAccessor,
    SyntaxKind.SetAccessor,
    SyntaxKind.Constructor,
  ].includes(node.getKind());
}

export function isTransactionRun(call: CallExpression): boolean {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'run') return false;
  return expression.getExpression().getType().getSymbol()?.getName() === 'ITransactionManager';
}

function isAfterCommitCallback(node: Node): boolean {
  const parent = node.getParent();
  if (!Node.isCallExpression(parent)) return false;

  const expression = parent.getExpression();
  if (
    !Node.isPropertyAccessExpression(expression) ||
    expression.getName() !== 'scheduleAfterCommit'
  ) {
    return false;
  }

  return (
    parent.getArguments()[0] === node &&
    expression.getExpression().getType().getSymbol()?.getName() === 'ITransactionManager'
  );
}

export function isDirectlyInsideTransactionCallback(call: CallExpression): boolean {
  let current: Node | undefined = call.getParent();
  while (current) {
    if (Node.isCallExpression(current) && isTransactionRun(current)) {
      const callback = current.getArguments()[0];
      if (!callback) return false;
      let descendant: Node | undefined = call;
      while (descendant && descendant !== current) {
        if (
          descendant !== callback &&
          isFunctionBoundary(descendant) &&
          isAfterCommitCallback(descendant)
        ) {
          return false;
        }
        if (descendant === callback) return true;
        descendant = descendant.getParent();
      }
    }
    current = current.getParent();
  }
  return false;
}
