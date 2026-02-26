import pandas as pd
import numpy as np


df = pd.read_csv("data/sports.csv")
A = np.array([
    [3,4,6,7,3],
    [1,3,4,5,6],
    [1,2,4,6,2],
    [5,3,2,1,5],
    [2,5,3,1,4]
])

valores, vectores = np.linalg.eig(A)
d = np

print(f'Autovectores: {vectores}')
print(f'Autovalores: {valores}')

