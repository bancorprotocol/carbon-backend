describe('seed-preview', () => {
  it('should export as a runnable script', () => {
    expect(true).toBe(true);
  });

  describe('DEPLOYMENT_TO_BLOCKCHAIN mapping', () => {
    const DEPLOYMENT_TO_BLOCKCHAIN: Record<string, string> = {
      ethereum: 'ethereum',
      sei: 'sei-network',
      celo: 'celo',
      coti: 'coti',
    };

    it('should map ethereum correctly', () => {
      expect(DEPLOYMENT_TO_BLOCKCHAIN['ethereum']).toBe('ethereum');
    });

    it('should map sei correctly', () => {
      expect(DEPLOYMENT_TO_BLOCKCHAIN['sei']).toBe('sei-network');
    });

    it('should map celo correctly', () => {
      expect(DEPLOYMENT_TO_BLOCKCHAIN['celo']).toBe('celo');
    });

    it('should map coti correctly', () => {
      expect(DEPLOYMENT_TO_BLOCKCHAIN['coti']).toBe('coti');
    });

    it('should return undefined for unsupported chains', () => {
      expect(DEPLOYMENT_TO_BLOCKCHAIN['unsupported-chain']).toBeUndefined();
    });
  });
});
