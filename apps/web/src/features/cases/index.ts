/**
 * Public surface of the cases slice.
 *
 * `server/service.ts` stays private — it is the only module allowed to touch
 * the database, and a second caller would be a second authorization path.
 * `ensureOpenCase` is the one exception the assessments slice will need; it is
 * exported through the tRPC procedure rather than directly.
 */
export { CaseForm } from './components/case-form';
export { CaseList, type CaseListItem } from './components/case-list';
export { CaseStatusButton } from './components/case-status-button';
export {
  caseIdSchema,
  caseStatusSchema,
  caseTypeSchema,
  createCaseSchema,
  listCasesSchema,
  setCaseStatusSchema,
  type CaseIdInput,
  type CaseStatusInput,
  type CaseTypeInput,
  type CreateCaseInput,
  type ListCasesInput,
  type SetCaseStatusInput,
} from './schemas';
