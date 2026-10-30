const esModules = [
  '@langchain/langgraph',
  '@langchain/langgraph-checkpoint',
  '@langchain/langgraph-sdk',
  'uuid',
  // sanitize-html nests ESM-only htmlparser2 and its dom* helpers.
  'htmlparser2',
  'domelementtype',
  'domhandler',
  'domutils',
  'dom-serializer',
  'entities',
].join('|');

export default {
  collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}', '!<rootDir>/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '\\.dev\\.ts$',
    '\\.helper\\.ts$',
    '\\.helper\\.d\\.ts$',
    '/__tests__/helpers/',
    '\\.manual\\.spec\\.[jt]sx?$',
  ],
  coverageReporters: ['text', 'cobertura'],
  testResultsProcessor: 'jest-junit',
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  // The second lookahead keeps nested copies (node_modules/x/node_modules/<esm>) transformable.
  transformIgnorePatterns: [
    `/node_modules/(?!(${esModules})/)(?!.*/node_modules/(${esModules})/).*/`,
  ],
  moduleNameMapper: {
    '^@src/(.*)$': '<rootDir>/src/$1',
    '~/(.*)': '<rootDir>/src/$1',
  },
  // coverageThreshold: {
  //   global: {
  //     statements: 58,
  //     branches: 49,
  //     functions: 50,
  //     lines: 57,
  //   },
  // },
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  maxWorkers: '50%',
  restoreMocks: true,
  testTimeout: 15000,
};
