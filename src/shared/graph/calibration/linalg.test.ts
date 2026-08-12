import { describe, expect, it } from "vitest";
import { determinant3, identity, jacobiEigenSymmetric, multiply, rq3, smallestEigenvector, transpose } from "./linalg";

describe("multiply", () => {
  it("multiplies compatible matrices", () => {
    // Arrange
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [5, 6],
      [7, 8],
    ];

    // Act
    const product = multiply(a, b);

    // Assert
    expect(product).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it("leaves a matrix unchanged when multiplied by identity", () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ];
    expect(multiply(a, identity(3))).toEqual(a);
  });
});

describe("jacobiEigenSymmetric", () => {
  it("recovers eigenvalues of a diagonal matrix", () => {
    // Arrange
    const a = [
      [3, 0, 0],
      [0, 1, 0],
      [0, 0, 2],
    ];

    // Act
    const { values } = jacobiEigenSymmetric(a);

    // Assert
    expect([...values].sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it("recovers known eigenvalues and eigenvectors of a 2x2 symmetric matrix", () => {
    // Arrange — [[2,1],[1,2]] has eigenvalues 1 and 3
    const a = [
      [2, 1],
      [1, 2],
    ];

    // Act
    const { values, vectors } = jacobiEigenSymmetric(a);

    // Assert
    const sorted = [...values].sort((x, y) => x - y);
    expect(sorted[0]).toBeCloseTo(1, 10);
    expect(sorted[1]).toBeCloseTo(3, 10);

    // Each column of `vectors` must satisfy A v = lambda v
    for (let col = 0; col < 2; col++) {
      const v = [vectors[0][col], vectors[1][col]];
      const av = [a[0][0] * v[0] + a[0][1] * v[1], a[1][0] * v[0] + a[1][1] * v[1]];
      expect(av[0]).toBeCloseTo(values[col] * v[0], 10);
      expect(av[1]).toBeCloseTo(values[col] * v[1], 10);
    }
  });

  it("returns orthonormal eigenvectors", () => {
    const a = [
      [4, 1, 2],
      [1, 3, 0],
      [2, 0, 5],
    ];
    const { vectors } = jacobiEigenSymmetric(a);
    const vtv = multiply(transpose(vectors), vectors);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(vtv[i][j]).toBeCloseTo(i === j ? 1 : 0, 10);
      }
    }
  });
});

describe("smallestEigenvector", () => {
  it("finds the null direction of a rank-deficient symmetric matrix", () => {
    // Arrange — A = n n^T for n = (0,0,1) has a two-dimensional null space,
    // so instead use a matrix with a single, unambiguous null direction.
    const a = [
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 0],
    ];

    // Act
    const v = smallestEigenvector(a);

    // Assert — should be +/- (0,0,1)
    expect(Math.abs(v[2])).toBeCloseTo(1, 10);
    expect(Math.abs(v[0])).toBeCloseTo(0, 10);
    expect(Math.abs(v[1])).toBeCloseTo(0, 10);
  });

  it("returns a unit-length vector", () => {
    const a = [
      [5, 2, 1],
      [2, 4, 0],
      [1, 0, 3],
    ];
    const v = smallestEigenvector(a);
    const norm = Math.hypot(...v);
    expect(norm).toBeCloseTo(1, 10);
  });
});

describe("rq3", () => {
  it("factors a matrix into upper-triangular R times orthogonal Q", () => {
    // Arrange — a generic invertible 3x3
    const m = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ];

    // Act
    const { r, q } = rq3(m);

    // Assert — R is upper triangular
    expect(r[1][0]).toBeCloseTo(0, 10);
    expect(r[2][0]).toBeCloseTo(0, 10);
    expect(r[2][1]).toBeCloseTo(0, 10);

    // Q is orthogonal with determinant +1 (a rotation, not a reflection)
    const qqt = multiply(q, transpose(q));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(qqt[i][j]).toBeCloseTo(i === j ? 1 : 0, 10);
      }
    }
    expect(determinant3(q)).toBeCloseTo(1, 10);

    // R * Q reconstructs the original
    const reconstructed = multiply(r, q);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(reconstructed[i][j]).toBeCloseTo(m[i][j], 10);
      }
    }
  });

  it("produces a positive diagonal on R", () => {
    // A camera intrinsic matrix must have positive focal lengths — the sign
    // fix in rq3 is what guarantees that regardless of the input's own signs.
    const m = [
      [-2, 1, 4],
      [0, -3, 5],
      [1, 2, -6],
    ];
    const { r } = rq3(m);
    expect(r[0][0]).toBeGreaterThan(0);
    expect(r[1][1]).toBeGreaterThan(0);
    expect(r[2][2]).toBeGreaterThan(0);
  });
});
