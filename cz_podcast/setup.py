from setuptools import setup


setup(
    name="cz_podcast",
    version="0.1.0",
    py_modules=["cz_podcast"],
    license="MIT",
    long_description="clean and easy to understand",
    install_requires=["commitizen"],
    entry_points={"commitizen.plugin": ["cz_podcast = cz_podcast:ConventionalCommitsCzPodcast"]},
)
