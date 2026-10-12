import { useTranslations } from 'next-intl';
import type { ResourceRequirementLine } from '@/features/booking/model/recurring-requirements';

/**
 * The wording of one resource requirement in the creation flow (TD49 Story 2): its title, the
 * line for an automatic one and the messages of a pick group. A single requirement keeps the plain
 * "Recurso" wording; in a bundle every requirement is titled by its resource type, numbered when
 * the type repeats ("Profissional 1", "Profissional 2").
 */
export function useRequirementText() {
  const tr = useTranslations('booking.resourcePicker');
  const tn = useTranslations('customer.recurringSchedules.new');

  return {
    title(line: ResourceRequirementLine, bundle: boolean): string {
      if (!bundle) return tn('fieldResource');
      const type = tr(`sectionTitle.${line.type}`);
      return line.typeNumber === null
        ? type
        : tn('resourceTitleNumbered', { type, number: line.typeNumber });
    },
    /** The read-only line of a requirement the system resolves every week. */
    autoLine(line: ResourceRequirementLine): string {
      return line.selectionMode === 'AUTO_FUNGIBLE_POOL'
        ? tn('autoPoolLine')
        : tn(`autoAnyLine.${line.type}`);
    },
    /** The review step's value for a requirement the system resolves every week. */
    autoChosen(line: ResourceRequirementLine): string {
      return tn(`autoChosen.${line.type}`);
    },
    requiredMessage(line: ResourceRequirementLine, bundle: boolean): string {
      return bundle ? tr(`headingSingle.${line.type}`) : tn('errorResourceRequired');
    },
    noOptionsMessage(line: ResourceRequirementLine): string {
      return tn(`resourceNoOptions.${line.type}`);
    },
  };
}
