export enum BranchScopeMode {
  OPTIONAL_SELECTION = 'OPTIONAL_SELECTION',
  REQUIRED_SELECTION = 'REQUIRED_SELECTION',
}

export type BranchContext =
  | {
      scope: 'ALL';
      selectedBranchId: null;
      allowedBranchIds: null;
    }
  | {
      scope: 'SELECTED';
      selectedBranchId: string;
      allowedBranchIds: string[] | null;
    }
  | {
      scope: 'ALLOWED_SET';
      selectedBranchId: null;
      allowedBranchIds: string[];
    }
  | {
      scope: 'NONE';
      selectedBranchId: null;
      allowedBranchIds: [];
    };

export type BranchWhere =
  | { scope: 'UNRESTRICTED' }
  | {
      scope: 'FILTERED';
      where: { branchId: string | { in: string[] } };
    };
